import { HachiwareMascot } from "@/components/mascots";
import { PageHeading } from "@/components/page-heading";
import { StudentManager } from "@/components/students/student-manager";
import { listStudents } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const students = await listStudents();

  return (
    <div className="space-y-4">
      <PageHeading
        title="学生名单"
        description="名单只用于让 AI 认人，不会把没提到的学生写进复盘。"
        mascot={<HachiwareMascot className="h-9 w-9" />}
      />
      <StudentManager initialStudents={students} />
    </div>
  );
}
