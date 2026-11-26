import { redirect } from "next/navigation";
import { DemoStudentsView } from "@/components/demo/demo-students-view";
import { getSession } from "@/lib/auth";

export default async function DemoStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const session = await getSession();
  const { preview } = await searchParams;

  // 已登录用户默认看正式学生名单；带 preview=1 时允许查看演示
  if (session && preview !== "1") redirect("/students");

  return <DemoStudentsView />;
}
