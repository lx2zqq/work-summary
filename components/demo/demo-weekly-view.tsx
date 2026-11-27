"use client";

import { useMemo } from "react";
import { useDemo } from "@/components/demo/demo-provider";
import { PageHeading } from "@/components/page-heading";
import { WeeklyReportWorkspace } from "@/components/weekly-report-workspace";
import { buildDemoWeeklyReviewDates } from "@/lib/demo-data";

export function DemoWeeklyView() {
  const { today, students } = useDemo();
  const reviewDates = useMemo(
    () => buildDemoWeeklyReviewDates(today),
    [today],
  );

  return (
    <div className="space-y-4">
      <PageHeading title="周报" />
      <WeeklyReportWorkspace
        mode="demo"
        today={today}
        demoStudents={students}
        demoReviewDates={reviewDates}
      />
    </div>
  );
}
