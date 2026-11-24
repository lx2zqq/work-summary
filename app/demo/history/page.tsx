"use client";

import { useMemo } from "react";
import { useDemo } from "@/components/demo/demo-provider";
import { HistoryList } from "@/components/history/history-list";

export default function DemoHistoryPage() {
  const { reviews, students, today } = useDemo();

  const stats = useMemo(() => {
    const month = today.slice(0, 7);

    return {
      total: reviews.length,
      monthDays: new Set(
        reviews
          .filter((item) => item.reviewDate.startsWith(month))
          .map((item) => item.reviewDate),
      ).size,
    };
  }, [reviews, today]);

  return (
    <HistoryList
      items={reviews}
      students={students}
      stats={stats}
      demoMode
    />
  );
}
