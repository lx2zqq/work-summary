import { Workspace } from "@/components/workspace/workspace";
import { isValidISODate, todayISO } from "@/lib/date";
import {
  getReviewByDate,
  getSettings,
  listStudents,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const reviewDate =
    date && isValidISODate(date) ? date : todayISO();

  // 串行读取，避免 Supabase 连接池在并发查询时卡住
  const review = await getReviewByDate(reviewDate);
  const students = await listStudents();
  const settings = await getSettings();

  return (
    <Workspace
      initialDate={reviewDate}
      initialReview={review}
      initialStudents={students}
      initialSettings={settings}
    />
  );
}
