"use client";

import { useDemo } from "@/components/demo/demo-provider";
import { HistoryList } from "@/components/history/history-list";
import { ChiikawaMascot } from "@/components/mascots";
import { PageHeading } from "@/components/page-heading";

export default function DemoHistoryPage() {
  const { reviews } = useDemo();

  return (
    <div className="space-y-4">
      <PageHeading
        title="历史复盘"
        description="演示数据，复制按钮可以正常使用。"
        mascot={<ChiikawaMascot className="h-9 w-9" />}
      />
      <HistoryList items={reviews} demoMode />
    </div>
  );
}
