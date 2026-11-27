import { NextResponse } from "next/server";
import {
  AiError,
  getAiErrorMessage,
  isAiConfigured,
} from "@/lib/ai/deepseek";
import { isAbortError } from "@/lib/ai/errors";
import { generateWeeklyReport } from "@/lib/ai/weekly";
import {
  firstIssue,
  jsonError,
  rateLimitExceeded,
  requireApiSession,
} from "@/lib/api-helpers";
import { getWeekRange } from "@/lib/date";
import {
  listActiveMemories,
  listActiveStudents,
  listWeeklySourceReviews,
  saveWeeklyReport,
} from "@/lib/db/queries";
import { checkAiRateLimit } from "@/lib/rate-limit";
import { weeklyReportGenerateRequestSchema } from "@/lib/schema";
import { summarizeActiveStudentsByGrade } from "@/lib/weekly-report";

export const maxDuration = 60;

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const limit = checkAiRateLimit(request, "weeklyGenerate");
  if (!limit.allowed) return rateLimitExceeded(limit.retryAfter);

  const body = await request.json().catch(() => null);
  const parsed = weeklyReportGenerateRequestSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(firstIssue(parsed.error), 400);
  }

  if (!isAiConfigured()) {
    return jsonError(
      "服务端还没有配置 REVIEW_DEEPSEEK_API_KEY，暂时无法生成周报，请手动填写。",
      503,
    );
  }

  const week = getWeekRange(parsed.data.weekStart);
  const sourceStartDate = parsed.data.sourceStartDate ?? week.weekStart;
  const sourceEndDate = parsed.data.sourceEndDate ?? week.weekEnd;

  try {
    // 严格串行读取，避免并发查询占满 Supabase 连接池
    const reviews = await listWeeklySourceReviews(sourceStartDate, sourceEndDate);

    if (reviews.length === 0) {
      return jsonError(
        "该日期范围内暂无日报，可调整汇总日期或手动填写周报",
        400,
      );
    }

    const memories = await listActiveMemories();
    const students = await listActiveStudents();
    const computedActiveStudentsByGrade =
      summarizeActiveStudentsByGrade(students);

    const content = await generateWeeklyReport(
      {
        weekStart: week.weekStart,
        weekEnd: week.weekEnd,
        sourceStartDate,
        sourceEndDate,
        reviews,
        memories,
        activeStudentsByGrade: computedActiveStudentsByGrade,
      },
      { signal: request.signal },
    );

    const report = await saveWeeklyReport({
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      content,
      status: "draft",
      sourceReviewCount: reviews.length,
      generatedAt: new Date(),
    });

    return NextResponse.json({ report });
  } catch (error) {
    if (isAbortError(error, request.signal)) {
      console.info("[weekly-reports:generate] 客户端已断开，已中止生成");
      return jsonError("请求已取消", 499);
    }

    if (error instanceof AiError) {
      console.error("[weekly-reports:generate:ai]", error);
      return jsonError(getAiErrorMessage(error), 502);
    }

    console.error("[weekly-reports:generate]", error);
    return jsonError("生成周报失败，请稍后重试", 500);
  }
}
