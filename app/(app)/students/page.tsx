import { PageHeading } from "@/components/page-heading";
import { StudentManager } from "@/components/students/student-manager";
import {
  listMemories,
  listReviewSnippets,
  listStudents,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const students = await listStudents();
  const memories = await listMemories();
  const reviews = await listReviewSnippets();

  return (
    <div className="space-y-4">
      <PageHeading title="学生名单" />
      <StudentManager
        initialStudents={students}
        memories={memories}
        reviews={reviews}
      />
    </div>
  );
}
