import { redirect } from "next/navigation";
import { DemoWeeklyView } from "@/components/demo/demo-weekly-view";
import { getSession } from "@/lib/auth";

export default async function DemoWeeklyPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const session = await getSession();
  const { preview } = await searchParams;

  // 已登录用户默认看正式周报；带 preview=1 时允许查看演示
  if (session && preview !== "1") redirect("/weekly");

  return <DemoWeeklyView />;
}
