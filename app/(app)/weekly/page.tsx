import { PageHeading } from "@/components/page-heading";
import { WeeklyReportWorkspace } from "@/components/weekly-report-workspace";
import { requireSession } from "@/lib/auth";
import { todayISO } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function WeeklyPage() {
  // 查询之前先鉴权：layout 和 page 是并行渲染的，不能只依赖 layout
  await requireSession();
  const today = todayISO();

  return (
    <div className="space-y-4">
      <PageHeading title="周报" />
      <WeeklyReportWorkspace mode="live" today={today} />
    </div>
  );
}
