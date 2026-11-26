import { redirect } from "next/navigation";
import { DemoSettingsView } from "@/components/demo/demo-settings-view";
import { getSession } from "@/lib/auth";

export default async function DemoSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const session = await getSession();
  const { preview } = await searchParams;

  // 已登录用户默认看正式设置；带 preview=1 时允许查看演示
  if (session && preview !== "1") redirect("/settings");

  return <DemoSettingsView />;
}
