import { redirect } from "next/navigation";
import { DemoMemoriesView } from "@/components/demo/demo-memories-view";
import { getSession } from "@/lib/auth";

export default async function DemoMemoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const session = await getSession();
  const { preview } = await searchParams;

  // 已登录用户默认看正式记忆；带 preview=1 时允许查看演示
  if (session && preview !== "1") redirect("/memories");

  return <DemoMemoriesView />;
}
