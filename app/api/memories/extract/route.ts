import { NextResponse } from "next/server";
import { AiError, getAiErrorMessage } from "@/lib/ai/deepseek";
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
  createMemory,
  getReviewByDate,
  getSettings,
  listActiveMemories,
  listStudents,
  markMemoryExtracted,
  updateMemory,
} from "@/lib/db/queries";
import {
  MEMORY_MERGE_THRESHOLD,
  hasSameMemoryContent,
  isMemoryExtractionStale,
  memorySimilarity,
  resolveMemoryStudent,
  selectMemoriesForPrompt,
} from "@/lib/memory";
import { extractMemoriesRequestSchema } from "@/lib/schema";
import type { Memory } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const limit = checkAiRateLimit(request, "memoryExtract");
  if (!limit.allowed) return rateLimitExceeded(limit.retryAfter);

  const body = await request.json().catch(() => null);
  const parsed = extractMemoriesRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: firstIssue(parsed.error) },
      { status: 400 },
    );
  }

  const { date, force } = parsed.data;

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
    const existingForPrompt = selectMemoriesForPrompt(existing, {
      corpus: review.finalText,
      students,
      limit: 60,
    });

    const startedAt = Date.now();
    let usage = {
      promptTokens: 0,
      completionTokens: 0,
      retried: false,
    };

    const extracted = await extractMemories(
      {
        date,
        finalText: review.finalText,
        students,
        existing: existingForPrompt,
      },
      {
        onUsage: (value) => {
          usage = value;
        },
        signal: request.signal,
      },
    );

    const created: Memory[] = [];
    const touchedIds = new Set<string>();

    const sameStudent = (
      memory: Memory,
      resolved: { studentId: string | null; studentName: string | null },
    ) => {
      if (resolved.studentId) {
        return memory.studentId === resolved.studentId;
      }

      return (
        memory.studentId === null &&
        memory.studentName === resolved.studentName
      );
    };

    for (const item of extracted) {
      const resolved = resolveMemoryStudent(item, students);

      if (item.scope === "student" && !resolved.studentName) {
        continue;
      }

      const existingById = item.id
        ? existing.find((memory) => memory.id === item.id)
        : null;

      if (existingById) {
        const updated = await updateMemory(existingById.id, {
          scope: item.scope,
          studentId: resolved.studentId,
          studentName: resolved.studentName,
          category: item.category,
          content: item.content,
          importance: item.importance,
          sourceDate: date,
        });

        if (updated) touchedIds.add(updated.id);
        continue;
      }

      const candidates = [...existing, ...created];
      const duplicate = candidates.find(
        (memory) =>
          memory.scope === item.scope &&
          sameStudent(memory, resolved) &&
          hasSameMemoryContent(memory, item.content),
      );

      if (duplicate) continue;

      // 模型没按 id 更新时，用相似度兜底合并同一件事的不同说法
      const similar = candidates
        .filter(
          (memory) =>
            memory.scope === item.scope &&
            memory.category === item.category &&
            sameStudent(memory, resolved),
        )
        .map((memory) => ({
          memory,
          score: memorySimilarity(memory.content, item.content),
        }))
        .filter((entry) => entry.score >= MEMORY_MERGE_THRESHOLD)
        .sort((a, b) => b.score - a.score)[0]?.memory;

      if (similar) {
        const updated = await updateMemory(similar.id, {
          scope: item.scope,
          studentId: resolved.studentId,
          studentName: resolved.studentName,
          category: item.category,
          content: item.content,
          importance: item.importance,
          sourceDate: date,
        });

        if (updated) touchedIds.add(updated.id);
        continue;
      }

      const memory = await createMemory({
        scope: item.scope,
        studentId: resolved.studentId,
        studentName: resolved.studentName,
        category: item.category,
        content: item.content,
        importance: item.importance,
        sourceDate: date,
      });

      created.push(memory);
      touchedIds.add(memory.id);
    }

    const extractedAt = await markMemoryExtracted(date);

    await trackEvent({
      event: "memory_extracted",
      reviewDate: date,
      properties: {
        created: created.length,
        updated: Math.max(0, touchedIds.size - created.length),
        durationMs: Date.now() - startedAt,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        retried: usage.retried,
      },
    });

    return NextResponse.json({
      skipped: false,
      count: touchedIds.size,
      created: created.length,
      updated: Math.max(0, touchedIds.size - created.length),
      extractedAt,
    });
  } catch (error) {
    // 客户端主动断开：静默结束，不算失败
    if (isAbortError(error, request.signal)) {
      console.info("[memories:extract] 客户端已断开，已中止提取");
      return NextResponse.json({ error: "请求已取消" }, { status: 499 });
    }

    console.error("[memories:extract]", error);

    if (error instanceof AiError && error.kind === "config") {
      return NextResponse.json(
        { error: getAiErrorMessage(error) },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: getAiErrorMessage(error) },
      { status: 502 },
    );
  }
}
