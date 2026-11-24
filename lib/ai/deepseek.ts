// 仅服务端使用：不要在客户端组件里 import 这个文件
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { countDraftItems, normalizeDraft } from "@/lib/draft";
import { draftSchema } from "@/lib/schema";
import {
  MAX_FOLLOW_UP_ROUNDS,
  MAX_QUESTIONS_PER_ROUND,
  SECTION_ORDER,
  emptySections,
  type MemoryPromptItem,
  type ReviewDraft,
} from "@/lib/types";
import {
  AGENT_BUDGET_MS,
  isToolsUnsupportedError,
  runAgent,
} from "./agent";
import { AiError } from "./errors";
import { buildPromptMessages, type PromptContext } from "./prompt";
import type { ToolDeps } from "./tools";

export { AiError } from "./errors";
export type { AiErrorKind } from "./errors";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-flash";

/** 整个生成请求的预算，路由 maxDuration 是 60 秒 */
const TOTAL_BUDGET_MS = 50_000;
/** 格式纠错重试的最后期限保护，留时间给兜底和响应 */
const MIN_RETRY_BUDGET_MS = 8_000;

export function isAiConfigured(): boolean {
  return Boolean(process.env.REVIEW_DEEPSEEK_API_KEY?.trim());
}

export function getAiModelName(): string {
  return process.env.REVIEW_DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL;
}

/**
 * 工具模式开关。
 * auto：优先用工具，模型不支持时自动降级到预注入；
 * off：强制使用原来的全量预注入。
 */
export function resolveToolsMode(): "auto" | "off" {
  return process.env.REVIEW_TOOLS_MODE?.trim() === "off" ? "off" : "auto";
}

export function createClient(): OpenAI {
  const apiKey = process.env.REVIEW_DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new AiError(
      "服务端未配置 REVIEW_DEEPSEEK_API_KEY",
      "config",
    );
  }

  const baseURL =
    process.env.REVIEW_DEEPSEEK_BASE_URL?.trim() || DEFAULT_BASE_URL;

  return new OpenAI({
    apiKey,
    baseURL,
    // 生成接口在 Vercel 上最多 60 秒；单次 25 秒，给重试和兜底留时间
    timeout: 25_000,
    maxRetries: 0,
  });
}

export function extractJson(text: string): string {
  let value = text.trim();

  if (value.startsWith("```")) {
    value = value
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }

  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start >= 0 && end > start) {
    value = value.slice(start, end + 1);
  }

  return value;
}

function parseDraft(content: string): {
  draft: ReviewDraft | null;
  error: string;
} {
  let parsed: unknown;

  try {
    parsed = JSON.parse(extractJson(content));
  } catch {
    return { draft: null, error: "输出不是合法 JSON" };
  }

  const result = draftSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 4)
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("；");
    return { draft: null, error: `JSON 字段不符合要求：${issues}` };
  }

  return { draft: normalizeDraft(result.data), error: "" };
}

export type AiUsage = {
  promptTokens: number;
  completionTokens: number;
  retried: boolean;
};

export type GenerateResult = {
  draft: ReviewDraft;
  usage: AiUsage;
  /** 实际请求模型的轮数，1 表示没有走工具循环 */
  toolRounds: number;
  /** 是否因为模型不支持工具而退回预注入 */
  degraded: boolean;
  /** 按顺序记录的工具名，用于埋点和评测 */
  toolCallNames: string[];
  /** 本次实际用到的记忆，回传给前端展示 */
  memories: MemoryPromptItem[];
};

export type GenerateOptions = {
  /** 工具执行依赖；没传时退回单次调用 */
  toolDeps?: ToolDeps;
  /** 测试用：注入 OpenAI client，生产环境不传 */
  client?: OpenAI;
  /** 正文增量回调；不传则全程非流式 */
  onContent?: (chunk: string) => void;
};

/** 保留原有调用方式；需要 token、工具和重试信息时用 generateDraftWithUsage */
export async function generateDraft(
  context: PromptContext,
  options: GenerateOptions = {},
): Promise<ReviewDraft> {
  const { draft } = await generateDraftWithUsage(context, options);
  return draft;
}

type CallOnceResult = {
  content: string;
  promptTokens: number;
  completionTokens: number;
};

async function callOnce(input: {
  client: OpenAI;
  model: string;
  messages: ChatCompletionMessageParam[];
  temperature: number;
  timeout: number;
}): Promise<CallOnceResult> {
  let completion;

  try {
    completion = await input.client.chat.completions.create(
      {
        model: input.model,
        messages: input.messages,
        temperature: input.temperature,
        max_tokens: 3000,
        response_format: { type: "json_object" },
      },
      { timeout: input.timeout },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    throw new AiError(`模型调用失败：${message}`, "request");
  }

  const content = completion.choices[0]?.message?.content?.trim() ?? "";

  if (completion.usage) {
    console.info(
      `[ai] ${input.model} tokens: prompt=${completion.usage.prompt_tokens}, completion=${completion.usage.completion_tokens}`,
    );
  }

  return {
    content,
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
  };
}

function toMessages(context: PromptContext): ChatCompletionMessageParam[] {
  return buildPromptMessages(context).map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

export async function generateDraftWithUsage(
  context: PromptContext,
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const client = options.client ?? createClient();
  const model = getAiModelName();
  const startedAt = Date.now();

  const usage: AiUsage = {
    promptTokens: 0,
    completionTokens: 0,
    retried: false,
  };

  let messages = toMessages(context);
  let content = "";
  let toolRounds = 1;
  let degraded = false;
  let toolCallNames: string[] = [];
  let memories: MemoryPromptItem[] = context.memories;

  const useTools =
    context.toolsEnabled === true &&
    context.mode !== "restyle" &&
    options.toolDeps !== undefined;

  if (useTools && options.toolDeps) {
    try {
      const result = await runAgent({
        client,
        model,
        messages,
        deps: options.toolDeps,
        budgetMs: AGENT_BUDGET_MS,
        onContent: options.onContent,
      });

      content = result.content;
      usage.promptTokens += result.promptTokens;
      usage.completionTokens += result.completionTokens;
      toolRounds = result.rounds;
      toolCallNames = result.toolCallNames;
      memories = result.memories;
    } catch (error) {
      // 模型不支持 tools 时退回预注入，保证换模型后线上不中断
      if (!isToolsUnsupportedError(error)) throw error;

      console.warn(
        "[ai] 当前模型不支持工具调用，已降级到预注入模式：",
        error instanceof Error ? error.message : error,
      );

      degraded = true;
      toolRounds = 1;
      messages = toMessages({ ...context, toolsEnabled: false });
      memories = context.memories;

      const fallback = await callOnce({
        client,
        model,
        messages,
        temperature: 0.25,
        timeout: Math.min(
          25_000,
          Math.max(1_000, TOTAL_BUDGET_MS - (Date.now() - startedAt)),
        ),
      });

      content = fallback.content;
      usage.promptTokens += fallback.promptTokens;
      usage.completionTokens += fallback.completionTokens;
    }
  } else {
    const result = await callOnce({
      client,
      model,
      messages,
      temperature: 0.25,
      timeout: 25_000,
    });

    content = result.content;
    usage.promptTokens += result.promptTokens;
    usage.completionTokens += result.completionTokens;
  }

  const first = parseDraft(content);
  if (first.draft) {
    return {
      draft: finalizeDraft(first.draft, context),
      usage,
      toolRounds,
      degraded,
      toolCallNames,
      memories,
    };
  }

  // 第一次格式不对时，把错误告诉模型再试一次；重试不再带工具，避免继续消耗预算
  const remaining = TOTAL_BUDGET_MS - (Date.now() - startedAt);
  if (remaining < MIN_RETRY_BUDGET_MS) {
    throw new AiError(first.error || "返回内容格式不对", "output");
  }

  usage.retried = true;

  const retry = await callOnce({
    client,
    model,
    messages: [
      ...messages,
      { role: "assistant", content: content || "（空输出）" },
      {
        role: "user",
        content: `上面的输出不能使用：${first.error}。请只输出修正后的完整 JSON，不要输出解释或 Markdown 代码块。`,
      },
    ],
    temperature: 0.1,
    timeout: Math.min(25_000, remaining),
  });

  usage.promptTokens += retry.promptTokens;
  usage.completionTokens += retry.completionTokens;

  const second = parseDraft(retry.content);
  if (second.draft) {
    return {
      draft: finalizeDraft(second.draft, context),
      usage,
      toolRounds,
      degraded,
      toolCallNames,
      memories,
    };
  }

  throw new AiError(
    "返回内容格式不对，已自动重试一次，请稍后再试",
    "output",
  );
}

export function finalizeDraft(
  draft: ReviewDraft,
  context: PromptContext,
): ReviewDraft {
  const maxQuestions =
    context.mode === "questions" && context.round < MAX_FOLLOW_UP_ROUNDS
      ? MAX_QUESTIONS_PER_ROUND
      : 0;

  const normalized = normalizeDraft(draft, { maxQuestions });
  const current = context.currentDraft;

  // 追问阶段只替换问题，必须保留已有正文；否则“重新生成”会清空用户编辑
  if (context.mode === "questions") {
    return {
      ...normalized,
      sections: current?.sections ?? emptySections(),
      dailyPhrase: current?.dailyPhrase ?? normalized.dailyPhrase,
    };
  }

  // 改文风不允许增删条目。模型漏栏目时宁可保留原稿，也不接受残缺结果。
  if (context.mode === "restyle") {
    const countsMatch =
      current !== undefined &&
      SECTION_ORDER.every(
        (key) =>
          normalized.sections[key].length === current.sections[key].length,
      );

    if (!countsMatch) {
      throw new AiError(
        "改文风结果不完整，已保留原稿，请稍后重试",
        "output",
      );
    }

    // 改文风只改正文，固定话术保持原样
    return {
      ...normalized,
      dailyPhrase: current?.dailyPhrase ?? normalized.dailyPhrase,
    };
  }

  // 最终稿返回空内容时不要覆盖已有正文，交给路由走兜底并提示用户
  if (countDraftItems(normalized) === 0) {
    throw new AiError(
      "这次没有生成有效正文，已保留当前草稿，请稍后重试",
      "output",
    );
  }

  // 最终稿漏掉整个栏目时，用当前草稿补上，避免已有内容被静默删除
  if (current) {
    for (const key of SECTION_ORDER) {
      if (
        normalized.sections[key].length === 0 &&
        current.sections[key].length > 0
      ) {
        normalized.sections[key] = [...current.sections[key]];
      }
    }
  }

  return normalized;
}

export function getAiErrorMessage(error: unknown): string {
  if (error instanceof AiError) {
    // 原始请求详情只写日志，页面上给一句中性提示
    if (error.kind === "request" && error.message.startsWith("模型调用失败")) {
      return "生成服务暂时出了点问题，请稍后重试";
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "生成服务暂时不可用";
}
