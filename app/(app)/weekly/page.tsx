import { PageHeading } from "@/components/page-heading";
import { WeeklyReportWorkspace } from "@/components/weekly-report-workspace";
import { requireSession } from "@/lib/auth";
import { getDefaultWeeklyReportRange, todayISO } from "@/lib/date";
import {
  getWeeklyReport,
  listActiveStudents,
  listReviewDatesInRange,
} from "@/lib/db/queries";
import type { WeeklyReportLoadResult } from "@/lib/types";
import { summarizeActiveStudentsByGrade } from "@/lib/weekly-report";

export const dynamic = "force-dynamic";

export default async function WeeklyPage() {
  // 查询之前先鉴权：layout 和 page 是并行渲染的，不能只依赖 layout
  await requireSession();

  const today = todayISO();
  const defaultRange = getDefaultWeeklyReportRange(
    new Date(`${today}T12:00:00+08:00`),
  );

  // 严格串行查询，避免并发占用 Supabase 连接池
  const report = await getWeeklyReport(defaultRange.weekStart);
  const sourceReviews = await listReviewDatesInRange(
    defaultRange.weekStart,
    defaultRange.weekEnd,
  );
  const students = await listActiveStudents();
  const computedActiveStudentsByGrade =
    summarizeActiveStudentsByGrade(students);

  const initialData: WeeklyReportLoadResult = {
    weekStart: defaultRange.weekStart,
    weekEnd: defaultRange.weekEnd,
    isMondayDefaultLastWeek: defaultRange.isMondayDefaultLastWeek,
    report,
    sourceReviews,
    computedActiveStudentsByGrade,
  };

  return (
    <div className="space-y-4">
      <PageHeading title="周报" />
      <WeeklyReportWorkspace
        mode="live"
        today={today}
        initialData={initialData}
      />
    </div>
  );
}
