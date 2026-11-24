import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { MemoryPromptItem } from "@/lib/types";
import { AiError, createAbortError, isAbortError } from "./errors";
import {
  buildToolParams,
  createToolCache,
  type ToolDeps,
} from "./tools";

/** 最多调用 4 次模型：前 3 次允许调工具，最后一次强制收尾 */
export const MAX_LLM_CALLS = 4;
/** 单次模型调用上限，实际会按剩余预算取更小值 */
export const SINGLE_CALL_TIMEOUT_MS = 25_000;
/** 工具循环整体预算，给格式纠错和兜底留时间 */
export const AGENT_BUDGET_MS = 30_000;

export type AgentRunInput = {
  client: OpenAI;
  model: string;
  messages: ChatCompletionMessageParam[];
  deps: ToolDeps;
  budgetMs?: number;
  /** 客户端断开时中止整个工具循环 */
  signal?: AbortSignal;
  /** 最后一轮的正文增量回调；不传则全程非流式 */
  onContent?: (chunk: string) => void;
};

export type AgentRunResult = {
  content: string;
  promptTokens: number;
  completionTokens: number;
  /** 按调用顺序记录的工具名，用于埋点和评测 */
  toolCallNames: string[];
  /** 实际请求模型的次数 */
  rounds: number;
  /** 工具命中的记忆，用于前端展示“参考了哪些记忆” */
  memories: MemoryPromptItem[];
};

type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
};

/**
 * 判断 400/404 是不是“不支持工具调用”。
 * 命中后上层会降级到预注入路径，保证换模型时线上不中断。
 */
export function isToolsUnsupportedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const status = (error as { status?: number }).status;
  if (status !== 400 && status !== 404) return false;

  const text = error.message.toLowerCase();
  return (
    text.includes("tools") ||
    text.includes("tool_choice") ||
    text.includes("tool_calls") ||
    text.includes("function calling")
  );
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "APIConnectionTimeoutError" ||
    /timed? ?out/i.test(error.message)
  );
}

function readUsage(completion: {
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  } | null;
}): TokenUsage {
  return {
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
  };
}

function requestParams(input: {
  model: string;
  messages: ChatCompletionMessageParam[];
  isLastCall: boolean;
}) {
  return {
    model: input.model,
    messages: input.messages,
    tools: buildToolParams(),
    tool_choice: input.isLastCall ? ("none" as const) : ("auto" as const),
    temperature: input.isLastCall ? 0.1 : 0.25,
    max_tokens: 3000,
    response_format: { type: "json_object" as const },
  };
}

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type StreamedCall = {
  content: string;
  toolCalls: ToolCall[];
  usage: TokenUsage;
  /** 思考模式的推理内容，必须原样回传给下一轮 */
  reasoning: string;
};

/**
 * 流式读取一轮模型输出。
 * 工具参数也是分片到达的，这里按 index 累积。
 */
async function streamCompletion(input: {
  client: OpenAI;
  model: string;
  messages: ChatCompletionMessageParam[];
  isLastCall: boolean;
  timeout: number;
  signal?: AbortSignal;
  onContent: (chunk: string) => void;
}): Promise<StreamedCall> {
  const stream = await input.client.chat.completions.create(
    {
      ...requestParams({
        model: input.model,
        messages: input.messages,
        isLastCall: input.isLastCall,
      }),
      stream: true,
      stream_options: { include_usage: true },
    },
    { timeout: input.timeout, signal: input.signal },
  );

  let content = "";
  let reasoning = "";
  let promptTokens = 0;
  let completionTokens = 0;
  const calls = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta as
      | {
          content?: string | null;
          reasoning_content?: string | null;
          tool_calls?: Array<{
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        }
      | undefined;

    if (delta?.content) {
      content += delta.content;
      input.onContent(delta.content);
    }

    if (delta?.reasoning_content) {
      reasoning += delta.reasoning_content;
    }

    for (const call of delta?.tool_calls ?? []) {
      const index = call.index ?? 0;
      const existing = calls.get(index) ?? {
        id: "",
        name: "",
        arguments: "",
      };

      if (call.id) existing.id = call.id;
      if (call.function?.name) existing.name = call.function.name;
      if (call.function?.arguments) {
        existing.arguments += call.function.arguments;
      }

      calls.set(index, existing);
    }

    if (chunk.usage) {
      promptTokens = chunk.usage.prompt_tokens ?? promptTokens;
      completionTokens = chunk.usage.completion_tokens ?? completionTokens;
    }
  }

  return {
    content: content.trim(),
    reasoning,
    usage: { promptTokens, completionTokens },
    toolCalls: [...calls.values()].map((call, index) => ({
      id: call.id || `call_${index}`,
      type: "function" as const,
      function: { name: call.name, arguments: call.arguments },
    })),
  };
}

/** 把流式结果还原成可回传的 assistant 消息，保留 reasoning_content */
function toAssistantMessage(input: {
  content: string;
  reasoning: string;
  toolCalls: ToolCall[];
}): ChatCompletionMessageParam {
  return {
    role: "assistant",
    content: input.content || null,
    tool_calls: input.toolCalls.length > 0 ? input.toolCalls : undefined,
    ...(input.reasoning ? { reasoning_content: input.reasoning } : {}),
  } as ChatCompletionMessageParam;
}

/**
 * 执行带工具调用的生成循环。
 *
 * 关键点：deepseek-flash 是思考模式模型，assistant 消息里的 reasoning_content
 * 必须原样回传给下一轮，否则接口返回 400。这里直接 push 原始 message 对象，
 * 不做字段裁剪。
 *
 * 流式只在最后一轮生效：前三轮返回的是 tool_calls，没有正文可流。
 * 流式失败时用同样的 messages 非流式重发一次，用户无感。
 */
export async function runAgent(
  input: AgentRunInput,
): Promise<AgentRunResult> {
  const deadline = Date.now() + (input.budgetMs ?? AGENT_BUDGET_MS);
  const messages: ChatCompletionMessageParam[] = [...input.messages];
  const runTool = createToolCache();

  const toolCallNames: string[] = [];
  const memoryMap = new Map<string, MemoryPromptItem>();
  let promptTokens = 0;
  let completionTokens = 0;
  let rounds = 0;

  while (rounds < MAX_LLM_CALLS) {
    // 客户端已断开：不再发起下一轮模型调用
    if (input.signal?.aborted) throw createAbortError();

    const isLastCall = rounds === MAX_LLM_CALLS - 1;
    const remaining = deadline - Date.now();

    if (remaining < 1_000) {
      throw new AiError(
        "处理超时，已保留当前草稿，请稍后重试",
        "timeout",
      );
    }

    const timeout = Math.min(SINGLE_CALL_TIMEOUT_MS, remaining);
    // 只要调用方要流式，每一轮都走流式：模型经常第二轮就出正文，
    // 只对「最后一轮」流式会永远等不到增量
    const useStream = input.onContent !== undefined;

    let content = "";
    // 中间轮次的 assistant 原始对象，回传时保留 reasoning_content
    let assistantMessage: ChatCompletionMessageParam | null = null;
    const toolCalls: ToolCall[] = [];
    let callUsage: TokenUsage = { promptTokens: 0, completionTokens: 0 };

    try {
      if (useStream && input.onContent) {
        try {
          const streamed = await streamCompletion({
            client: input.client,
            model: input.model,
            messages,
            isLastCall,
            timeout,
            signal: input.signal,
            onContent: input.onContent,
          });

          content = streamed.content;
          callUsage = streamed.usage;
          toolCalls.push(...streamed.toolCalls);
          assistantMessage = toAssistantMessage({
            content: streamed.content,
            reasoning: streamed.reasoning,
            toolCalls: streamed.toolCalls,
          });
        } catch (streamError) {
          // 客户端主动断开时不重发，直接向上抛中止错误
          if (isAbortError(streamError, input.signal)) throw streamError;

          // 流式中途失败：用同样的上下文非流式重发本轮，不给用户报错
          console.warn(
            "[agent] 流式失败，改用非流式重发：",
            streamError instanceof Error ? streamError.message : streamError,
          );

          const completion = await input.client.chat.completions.create(
            requestParams({ model: input.model, messages, isLastCall }),
            { timeout, signal: input.signal },
          );

          const message = completion.choices[0]?.message;
          content = message?.content?.trim() ?? "";
          callUsage = readUsage(completion);
          assistantMessage = message as ChatCompletionMessageParam;

          for (const call of message?.tool_calls ?? []) {
            if (call.type !== "function") continue;
            toolCalls.push({
              id: call.id,
              type: "function",
              function: {
                name: call.function.name,
                arguments: call.function.arguments,
              },
            });
          }
        }
      } else {
        const completion = await input.client.chat.completions.create(
          requestParams({
            model: input.model,
            messages,
            isLastCall,
          }),
          { timeout, signal: input.signal },
        );

        const message = completion.choices[0]?.message;
        content = message?.content?.trim() ?? "";
        callUsage = readUsage(completion);
        assistantMessage = message as ChatCompletionMessageParam;

        for (const call of message?.tool_calls ?? []) {
          if (call.type !== "function") continue;
          toolCalls.push({
            id: call.id,
            type: "function",
            function: {
              name: call.function.name,
              arguments: call.function.arguments,
            },
          });
        }
      }
    } catch (error) {
      // 中止错误保持原样，不能包装成普通请求失败
      if (isAbortError(error, input.signal)) throw error;

      // 第一轮失败原样抛出，交给上层判断能不能降级
      if (rounds === 0) throw error;

      if (isTimeoutError(error)) {
        throw new AiError(
          "处理超时，已保留当前草稿，请稍后重试",
          "timeout",
        );
      }

      const detail = error instanceof Error ? error.message : "未知错误";
      throw new AiError(`模型调用失败：${detail}`, "request");
    }

    rounds += 1;
    promptTokens += callUsage.promptTokens;
    completionTokens += callUsage.completionTokens;

    if (isLastCall || toolCalls.length === 0) {
      if (!content) {
        throw new AiError("这次没有生成有效内容，请稍后重试", "output");
      }

      return {
        content,
        promptTokens,
        completionTokens,
        toolCallNames,
        rounds,
        memories: [...memoryMap.values()],
      };
    }

    // 必须原样回传，reasoning_content 丢失会导致下一轮 400
    if (assistantMessage) {
      messages.push(assistantMessage);
    }

    for (const call of toolCalls) {
      if (input.signal?.aborted) throw createAbortError();

      const name = call.function.name;
      toolCallNames.push(name);

      const execution = await runTool(
        name,
        call.function.arguments,
        input.deps,
      );

      // 工具执行期间客户端可能已经断开，拿到结果也不再进入下一轮
      if (input.signal?.aborted) throw createAbortError();

      for (const memory of execution.memories) {
        memoryMap.set(memory.id, memory);
      }

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: execution.content,
      });
    }
  }

  throw new AiError("生成步骤过多，请稍后重试", "output");
}
