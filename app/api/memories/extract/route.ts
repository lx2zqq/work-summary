import { NextResponse } from "next/server";
import { getAiErrorMessage } from "@/lib/ai/deepseek";
import { isAbortError } from "@/lib/ai/errors";
import { extractMemories } from "@/lib/ai/memory";
import { trackEvent } from "@/lib/analytics/events";
import {
  firstIssue,
  rateLimitExceeded,
  requireApiSession,
} from "@/lib/api-helpers";
import { checkAiRateLimit } from "@/lib/rate-limit";
import {
  getReviewByDate,
  getSettings,
  listActiveMemories,
  listStudents,
  saveExtractedMemories,
} from "@/lib/db/queries";
import { isMemoryExtractionStale, selectMemoriesForPrompt } from "@/lib/memory";
import { extractMemoriesRequestSchema } from "@/lib/schema";
import type { MemoryPromptItem, Student } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type ExtractContext = {
  finalText: string;
  students: Student[];
  existing: MemoryPromptItem[];
};

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const parsed = extractMemoriesRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: firstIssue(parsed.error) },
      { status: 400 },
    );
  }

  const { date, force } = parsed.data;

  // 先把数据库侧的检查做完，确认确实要调模型后再扣限流额度，
  // 避免用户重复点击“更新记忆”时白白消耗 AI 次数。
  let context: ExtractContext | null = null;

  try {
    const settings = await getSettings();

    if (!settings.enableMemory) {
      return NextResponse.json({
        skipped: true,
        count: 0,
        reason: "长期记忆已在设置里关闭",
      });
    }

    const review = await getReviewByDate(date, settings);

    if (!review || !review.finalText.trim()) {
      return NextResponse.json(
        { error: "这篇复盘还没有生成正文，先完成并保存后再记忆。" },
        { status: 400 },
      );
    }

    // 正文在记忆提取后又有保存，就自动重新提取；force 用于手动“更新记忆”
    if (
      !force &&
      !isMemoryExtractionStale({
        extractedAt: review.memoryExtractedAt,
        updatedAt: review.updatedAt,
      })
    ) {
      return NextResponse.json({
        skipped: true,
        count: 0,
        extractedAt: review.memoryExtractedAt,
      });
    }

    const students = await listStudents();
    const existing = await listActiveMemories(200);

    context = {
      finalText: review.finalText,
      students,
      existing: selectMemoriesForPrompt(existing, {
        corpus: review.finalText,
        students,
        limit: 60,
      }),
    };
  } catch (error) {
    console.error("[memories:extract:db]", error);
    return NextResponse.json(
      { error: "读取数据失败，请稍后重试" },
      { status: 500 },
    );
  }

  if (!context) {
    return NextResponse.json(
      { error: "读取数据失败，请稍后重试" },
      { status: 500 },
    );
  }

  const limit = checkAiRateLimit(request, "memoryExtract");
  if (!limit.allowed) return rateLimitExceeded(limit.retryAfter);

  const startedAt = Date.now();
  let usage = {
    promptTokens: 0,
    completionTokens: 0,
    retried: false,
  };

  let extracted;

  try {
    extracted = await extractMemories(
      {
        date,
        finalText: context.finalText,
        students: context.students,
        existing: context.existing,
      },
      {
        onUsage: (value) => {
          usage = value;
        },
        signal: request.signal,
      },
    );
  } catch (error) {
    // 客户端已断开：静默结束，不算失败
    if (isAbortError(error, request.signal)) {
      console.info("[memories:extract] 客户端已断开，已中止提取");
      return NextResponse.json({ error: "请求已取消" }, { status: 499 });
    }

    console.error("[memories:extract:ai]", error);
    return NextResponse.json(
      { error: getAiErrorMessage(error) },
      { status: 502 },
    );
  }

  let saved: Awaited<ReturnType<typeof saveExtractedMemories>>;

  try {
    saved = await saveExtractedMemories({
      date,
      items: extracted,
      students: context.students,
    });
  } catch (error) {
    console.error("[memories:extract:save]", error);
    return NextResponse.json(
      { error: "保存记忆失败，请稍后重试" },
      { status: 500 },
    );
  }

  try {
    await trackEvent({
      event: "memory_extracted",
      reviewDate: date,
      properties: {
        created: saved.created,
        updated: saved.updated,
        durationMs: Date.now() - startedAt,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        retried: usage.retried,
      },
    });
  } catch (error) {
    // 埋点失败不影响已经写入的记忆
    console.error("[memories:extract:event]", error);
  }

  return NextResponse.json({
    skipped: false,
    count: saved.created + saved.updated,
    created: saved.created,
    updated: saved.updated,
    extractedAt: saved.extractedAt,
  });
}
