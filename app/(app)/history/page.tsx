import { HistoryList } from "@/components/history/history-list";
import { ChiikawaMascot } from "@/components/mascots";
import { PageHeading } from "@/components/page-heading";
import { listReviews } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const reviews = await listReviews(50);

  return (
    <div className="space-y-4">
      <PageHeading
        title="历史复盘"
        description="按日期倒序。点“打开”可以继续编辑，点“复制”直接发钉钉。"
        mascot={<ChiikawaMascot className="h-9 w-9" />}
      />
      <HistoryList items={reviews} />
    </div>
  );
}
