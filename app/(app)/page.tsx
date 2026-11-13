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

  const [review, students, settings] = await Promise.all([
    getReviewByDate(reviewDate),
    listStudents(),
    getSettings(),
  ]);

  return (
    <Workspace
      initialDate={reviewDate}
      initialReview={review}
      initialStudents={students}
      initialSettings={settings}
    />
  );
}
