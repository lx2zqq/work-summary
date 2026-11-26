import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DemoWorkspace } from "@/components/demo/demo-workspace";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "在线演示",
  description:
    "不用登录，先看看学管复盘助手怎么把口语化的流水账整理成可以直接发钉钉的工作复盘。",
};

export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const session = await getSession();
  const { preview } = await searchParams;

  // 已登录用户默认进正式工作台；带 preview=1 时允许查看演示
  if (session && preview !== "1") redirect("/");

  return <DemoWorkspace />;
}
