import { NextResponse } from "next/server";
import {
  firstIssue,
  jsonError,
  requireApiSession,
} from "@/lib/api-helpers";
import {
  getDefaultWeeklyReportRange,
  getWeekRange,
} from "@/lib/date";
import {
  getWeeklyReport,
  listActiveStudents,
  listReviewDatesInRange,
} from "@/lib/db/queries";
import { weeklyReportGenerateRequestSchema } from "@/lib/schema";
import { summarizeActiveStudentsByGrade } from "@/lib/weekly-report";

export const maxDuration = 30;

export async function GET(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const searchParams = new URL(request.url).searchParams;
  const defaultRange = getDefaultWeeklyReportRange();
  const weekParam = searchParams.get("weekStart");

  const parsed = weeklyReportGenerateRequestSchema.safeParse({
    weekStart: weekParam ?? defaultRange.weekStart,
    sourceStartDate: searchParams.get("sourceStartDate") ?? undefined,
    sourceEndDate: searchParams.get("sourceEndDate") ?? undefined,
  });

  if (!parsed.success) {
    return jsonError(firstIssue(parsed.error), 400);
  }

  const week = getWeekRange(parsed.data.weekStart);
  const sourceStartDate = parsed.data.sourceStartDate ?? week.weekStart;
  const sourceEndDate = parsed.data.sourceEndDate ?? week.weekEnd;

  try {
    // 严格串行，避免并发查询占满 Supabase 连接池
    const report = await getWeeklyReport(week.weekStart);
    const sourceReviews = await listReviewDatesInRange(
      sourceStartDate,
      sourceEndDate,
    );
    const students = await listActiveStudents();
    const computedActiveStudentsByGrade =
      summarizeActiveStudentsByGrade(students);

    return NextResponse.json({
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      isMondayDefaultLastWeek:
        weekParam === null ? defaultRange.isMondayDefaultLastWeek : false,
      report,
      sourceReviews,
      computedActiveStudentsByGrade,
    });
  } catch (error) {
    console.error("[weekly-reports:GET]", error);
    return jsonError("读取周报失败，请稍后重试", 500);
  }
}
