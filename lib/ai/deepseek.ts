// 仅服务端使用：不要在客户端组件里 import 这个文件
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { normalizeDraft } from "@/lib/draft";
import { draftSchema } from "@/lib/schema";
import {
  MAX_FOLLOW_UP_ROUNDS,
  MAX_QUESTIONS_PER_ROUND,
  SECTION_ORDER,
  emptySections,
  type ReviewDraft,
} from "@/lib/types";
import { buildPromptMessages, type PromptContext } from "./prompt";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-flash";

export class AiError extends Error {
  constructor(
    message: string,
    public readonly kind: "config" | "output" | "request" = "request",
  ) {
    super(message);
    this.name = "AiError";
  }
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.REVIEW_DEEPSEEK_API_KEY?.trim());
}

export function getAiModelName(): string {
  return process.env.REVIEW_DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL;
}

function createClient(): OpenAI {
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

function extractJson(text: string): string {
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

export async function generateDraft(
  context: PromptContext,
): Promise<ReviewDraft> {
  const client = createClient();
  const model = getAiModelName();

  const messages: ChatCompletionMessageParam[] = buildPromptMessages(
    context,
  ).map((message) => ({
    role: message.role,
    content: message.content,
  }));

  let content = "";

  try {
    const completion = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.25,
      max_tokens: 3000,
      response_format: { type: "json_object" },
    });

    content = completion.choices[0]?.message?.content?.trim() ?? "";

    if (completion.usage) {
      console.info(
        `[ai] ${model} tokens: prompt=${completion.usage.prompt_tokens}, completion=${completion.usage.completion_tokens}`,
      );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "未知错误";
    throw new AiError(`AI 调用失败：${message}`, "request");
  }

  const first = parseDraft(content);
  if (first.draft) {
    return finalizeDraft(first.draft, context);
  }

  // 第一次格式不对时，把错误告诉模型再试一次
  const retryMessages: ChatCompletionMessageParam[] = [
    ...messages,
    { role: "assistant", content: content || "（空输出）" },
    {
      role: "user",
      content: `上面的输出不能使用：${first.error}。请只输出修正后的完整 JSON，不要输出解释或 Markdown 代码块。`,
    },
  ];

  try {
    const retry = await client.chat.completions.create({
      model,
      messages: retryMessages,
      temperature: 0.1,
      max_tokens: 3000,
      response_format: { type: "json_object" },
    });

    const retryContent = retry.choices[0]?.message?.content?.trim() ?? "";
    const second = parseDraft(retryContent);

    if (second.draft) {
      return finalizeDraft(second.draft, context);
    }

    throw new AiError(
      "AI 返回的内容格式不对，已自动重试一次，请稍后再试",
      "output",
    );
  } catch (error) {
    if (error instanceof AiError) throw error;
    const message = error instanceof Error ? error.message : "未知错误";
    throw new AiError(`AI 重试失败：${message}`, "request");
  }
}

function countDraftItems(draft: ReviewDraft): number {
  return Object.values(draft.sections).reduce(
    (total, items) => total + items.length,
    0,
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
        "AI 改文风结果不完整，已保留原稿，请稍后重试",
        "output",
      );
    }

    return normalized;
  }

  // 最终稿返回空内容时不要覆盖已有正文，交给路由走兜底并提示用户
  if (countDraftItems(normalized) === 0) {
    throw new AiError(
      "AI 没有生成有效正文，已保留当前草稿，请稍后重试",
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
  if (error instanceof AiError) return error.message;
  if (error instanceof Error) return error.message;
  return "AI 暂时不可用";
}
