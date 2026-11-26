import { HistoryList } from "@/components/history/history-list";
import { requireSession } from "@/lib/auth";
import {
  getReviewStats,
  listReviews,
  listStudents,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  // 查询之前先鉴权：layout 和 page 是并行渲染的，不能只依赖 layout
  await requireSession();

  const reviews = await listReviews(50);
  const students = await listStudents();
  const stats = await getReviewStats();

  return (
    <HistoryList
      items={reviews}
      students={students}
      stats={stats}
      hasMore={reviews.length < stats.total}
    />
  );
}
