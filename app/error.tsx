"use client";

import { useEffect } from "react";
import { UsagiMascot } from "@/components/mascots";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="app-bg flex min-h-[70dvh] items-center justify-center px-4">
      <div className="paper-card w-full max-w-md p-6 text-center">
        <UsagiMascot className="mascot-float mx-auto h-24 w-24" mood="sad" />
        <h1 className="mt-3 text-lg font-extrabold text-ink">
          页面出了点问题
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          {error.message || "请稍后重试。"}
        </p>
        <p className="mt-2 rounded-2xl bg-cream-deep/60 px-3 py-2 text-xs leading-relaxed text-ink-soft">
          如果是第一次运行，先确认已经执行过{" "}
          <code className="rounded-lg bg-paper px-1.5 py-0.5 font-mono text-[11px] text-ink">
            npm run db:migrate
          </code>
          。
        </p>
        <Button className="mt-5" onClick={reset}>
          重试
        </Button>
      </div>
    </div>
  );
}
