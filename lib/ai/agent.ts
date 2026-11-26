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

/**
 * 执行带工具调用的生成循环。
 *
 * 关键点：deepseek-flash 是思考模式模型，assistant 消息里的 reasoning_content
 * 必须原样回传给下一轮，否则接口返回 400。这里直接 push 原始 message 对象，
 * 不做字段裁剪。
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

    let content = "";
    // 中间轮次的 assistant 原始对象，回传时保留 reasoning_content
    let assistantMessage: ChatCompletionMessageParam | null = null;
    const toolCalls: ToolCall[] = [];
    let callUsage: TokenUsage = { promptTokens: 0, completionTokens: 0 };

    try {
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

      // 原始 SDK 错误只写服务端日志，不拼进返回给前端的文案
      console.error("[agent:model]", error);
      throw new AiError("模型调用失败，请稍后重试", "request");
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
