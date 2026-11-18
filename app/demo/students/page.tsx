"use client";

import { useDemo } from "@/components/demo/demo-provider";
import { HachiwareMascot } from "@/components/mascots";
import { PageHeading } from "@/components/page-heading";
import { StudentManager } from "@/components/students/student-manager";

export default function DemoStudentsPage() {
  const { students, studentStore } = useDemo();

  return (
    <div className="space-y-4">
      <PageHeading
        title="学生名单"
        description="演示数据，可以增删改，刷新后恢复。"
        mascot={<HachiwareMascot className="h-9 w-9" />}
      />
      <StudentManager initialStudents={students} store={studentStore} />
    </div>
  );
}
