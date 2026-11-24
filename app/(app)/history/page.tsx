import { HistoryList } from "@/components/history/history-list";
import {
  getReviewStats,
  listReviews,
  listStudents,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const reviews = await listReviews(200);
  const students = await listStudents();
  const stats = await getReviewStats();

  return (
    <HistoryList items={reviews} students={students} stats={stats} />
  );
}
