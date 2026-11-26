"use client";

import { useEffect } from "react";
import { UsagiMascot } from "@/components/mascots";
import { Button } from "@/components/ui/button";

/** 只有开发环境展示原始错误，生产环境一律用通用文案 */
const isDev = process.env.NODE_ENV !== "production";

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
        <UsagiMascot className="mx-auto h-20 w-20" mood="sad" />
        <h1 className="mt-3 text-base font-semibold text-ink">
          页面出了点问题
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          刷新一下再试试，如果一直这样，请稍后再来。
        </p>

        <Button className="mt-5" onClick={reset}>
          重试
        </Button>

        {isDev ? (
          <details className="mt-4 rounded-lg bg-cream-deep/60 px-3 py-2 text-left">
            <summary className="cursor-pointer list-none text-xs font-medium text-ink-soft">
              调试信息（仅开发环境）
            </summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-ink-soft">
              {error.message || "（无错误信息）"}
            </pre>
            {error.digest ? (
              <p className="mt-1 text-[10px] text-ink-soft/70">
                digest: {error.digest}
              </p>
            ) : null}
          </details>
        ) : null}
      </div>
    </div>
  );
}
