import type { Metadata } from "next";
import { DemoWorkspace } from "@/components/demo/demo-workspace";

export const metadata: Metadata = {
  title: "在线演示",
  description:
    "不用登录，先看看学管复盘助手怎么把口语化的流水账整理成可以直接发钉钉的工作复盘。",
};

export default function DemoPage() {
  return <DemoWorkspace />;
}
