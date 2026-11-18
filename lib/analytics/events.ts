import "server-only";

import { z } from "zod";
import { getDb } from "@/lib/db";
import { usageEvents } from "@/lib/db/schema";

export const SERVER_EVENTS = [
  "generate_started",
  "generate_finished",
  "generate_failed",
  "review_saved",
  "review_copied",
  "question_answered",
  "memory_extracted",
] as const;

/** 客户端只能上报这两个事件，避免把接口变成任意写入 */
export const CLIENT_EVENTS = [
  "review_copied",
  "question_answered",
] as const;

export type ServerEvent = (typeof SERVER_EVENTS)[number];
export type ClientEvent = (typeof CLIENT_EVENTS)[number];

const count = (max: number) => z.number().int().min(0).max(max).optional();

/**
 * 事件属性只允许数量、枚举和耗时。
 * 复盘原文、学生姓名、问题内容一律不落库，避免把分析表变成隐私副本。
 */
export const eventPropertiesSchema = z
  .object({
    mode: z.enum(["questions", "final", "restyle"]).optional(),
    style: z.enum(["concise", "detailed"]).optional(),
    round: z.number().int().min(0).max(3).optional(),
    durationMs: z.number().int().min(0).max(600_000).optional(),
    promptTokens: count(1_000_000),
    completionTokens: count(1_000_000),
    retried: z.boolean().optional(),
    fallback: z.boolean().optional(),
    questionCount: count(20),
    itemCount: count(200),
    charCount: count(100_000),
    inputCharCount: count(100_000),
    answerCount: count(200),
    memoryCount: count(200),
    /** 模型实际查到的记忆条数；工具模式下才是真实使用量 */
    usedMemoryCount: count(200),
    answeredCount: count(20),
    usedOptionCount: count(20),
    skipped: z.boolean().optional(),
    created: count(50),
    updated: count(50),
    errorKind: z.enum(["config", "request", "output", "timeout"]).optional(),
    /** 本次生成调用的工具次数和模型轮数，只记数量不记参数 */
    toolCallCount: count(20),
    toolRounds: z.number().int().min(0).max(10).optional(),
    degraded: z.boolean().optional(),
  })
  .strict();

export type EventProperties = z.infer<typeof eventPropertiesSchema>;

function compactProperties(
  properties: EventProperties,
): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined),
  ) as Record<string, string | number | boolean | null>;
}

/** 埋点失败只告警，绝不打断生成、保存等主流程 */
export async function trackEvent(input: {
  event: ServerEvent;
  reviewDate?: string | null;
  properties?: EventProperties;
}): Promise<void> {
  try {
    await getDb()
      .insert(usageEvents)
      .values({
        event: input.event,
        reviewDate: input.reviewDate ?? null,
        properties: compactProperties(input.properties ?? {}),
      });
  } catch (error) {
    console.warn("[analytics] 记录事件失败：", input.event, error);
  }
}
