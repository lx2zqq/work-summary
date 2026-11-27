import { NextResponse } from "next/server";
import {
  firstIssue,
  jsonError,
  requireApiSession,
} from "@/lib/api-helpers";
import { getWeekRange, isValidISODate } from "@/lib/date";
import {
  getWeeklyReport,
  saveWeeklyReport,
} from "@/lib/db/queries";
import { weeklyReportSaveSchema } from "@/lib/schema";

type RouteParams = {
  params: Promise<{ weekStart: string }>;
};

export async function PUT(request: Request, context: RouteParams) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const { weekStart: rawWeekStart } = await context.params;
  if (!isValidISODate(rawWeekStart)) {
    return jsonError("weekStart 参数不对", 400);
  }

  const body = await request.json().catch(() => null);
  const parsed = weeklyReportSaveSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(firstIssue(parsed.error), 400);
  }

  const week = getWeekRange(rawWeekStart);

  try {
    // 手动保存前先取原记录，保留生成时写入的来源篇数和生成时间
    const existing = await getWeeklyReport(week.weekStart);

    const report = await saveWeeklyReport({
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      content: parsed.data.content,
      status: parsed.data.status,
      sourceReviewCount: existing?.sourceReviewCount ?? 0,
      generatedAt: existing?.generatedAt
        ? new Date(existing.generatedAt)
        : null,
    });

    return NextResponse.json({ report });
  } catch (error) {
    console.error("[weekly-reports:PUT]", error);
    return jsonError("保存周报失败，请稍后重试", 500);
  }
}
