import { PageHeading } from "@/components/page-heading";
import { StudentManager } from "@/components/students/student-manager";
import { requireSession } from "@/lib/auth";
import {
  listMemories,
  listReviewSnippets,
  listStudents,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  // 查询之前先鉴权：layout 和 page 是并行渲染的，不能只依赖 layout
  await requireSession();

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
