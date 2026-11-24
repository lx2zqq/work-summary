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
  const settings = await getSettings();
  const review = await getReviewByDate(reviewDate, settings);
  const students = await listStudents();

  return (
    <Workspace
      initialDate={reviewDate}
      initialReview={review}
      initialStudents={students}
      initialSettings={settings}
    />
  );
}
