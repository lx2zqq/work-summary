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
        description="AI 只写你提到的学生。"
        mascot={<HachiwareMascot className="h-9 w-9" />}
      />
      <StudentManager initialStudents={students} />
    </div>
  );
}
