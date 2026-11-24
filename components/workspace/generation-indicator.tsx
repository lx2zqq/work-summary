"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import {
  getGenerationJob,
  getGenerationServerSnapshot,
  subscribeGeneration,
} from "@/lib/generation-store";

/** 全局生成提示：切到别的页面也能知道后台还在生成 */
export function GenerationIndicator() {
  const job = useSyncExternalStore(
    subscribeGeneration,
    getGenerationJob,
    getGenerationServerSnapshot,
  );

  if (!job || (job.status !== "loading" && job.status !== "saving")) {
    return null;
  }

  return (
    <Link
      href={`/?date=${job.date}`}
      title="回到正在生成的复盘"
      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-soft px-3 py-1.5 text-[11px] font-medium text-brand-deep ring-1 ring-brand/25 transition-colors hover:bg-paper"
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      生成中…
    </Link>
  );
}
