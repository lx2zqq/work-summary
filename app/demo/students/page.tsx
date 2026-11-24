"use client";

import { useDemo } from "@/components/demo/demo-provider";
import { PageHeading } from "@/components/page-heading";
import { StudentManager } from "@/components/students/student-manager";

export default function DemoStudentsPage() {
  const { students, memories, reviews, studentStore } = useDemo();

  return (
    <div className="space-y-4">
      <PageHeading
        title="学生名单"
        description="演示数据，可以增删改，刷新后恢复。"
      />
      <StudentManager
        initialStudents={students}
        memories={memories}
        reviews={reviews}
        store={studentStore}
        demoMode
      />
    </div>
  );
}
