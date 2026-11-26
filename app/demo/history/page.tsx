import { redirect } from "next/navigation";
import { DemoHistoryView } from "@/components/demo/demo-history-view";
import { getSession } from "@/lib/auth";

export default async function DemoHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const session = await getSession();
  const { preview } = await searchParams;

  // 已登录用户默认看正式历史；带 preview=1 时允许查看演示
  if (session && preview !== "1") redirect("/history");

  return <DemoHistoryView />;
}
