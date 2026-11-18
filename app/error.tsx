"use client";

import { useEffect } from "react";
import { UsagiMascot } from "@/components/mascots";
import { Button } from "@/components/ui/button";

/** 把一长串堆栈翻译成一句能照着做的提示 */
function describeError(error: Error): string {
  const message = error.message || "";

  if (
    /CONNECT_TIMEOUT|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|Connection terminated|connect (ETIMEDOUT|ECONNREFUSED)/i.test(
      message,
    )
  ) {
    return "数据库连不上。本地测试可以先把 .env.local 里的 DATABASE_URL 注释掉，改用本地数据库；线上请检查 Supabase 是否可用。";
  }

  if (/does not exist|relation .* does not exist|table .* not found/i.test(message)) {
    return "数据库表还没建好，先执行 npm run db:migrate。";
  }

  if (/password authentication failed|invalid password/i.test(message)) {
    return "数据库账号或密码不对，检查 DATABASE_URL。";
  }

  return message || "请稍后重试。";
}

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
          {describeError(error)}
        </p>

        {error.message ? (
          <details className="mt-3 rounded-2xl bg-cream-deep/60 px-3 py-2 text-left">
            <summary className="cursor-pointer list-none text-xs font-bold text-ink-soft">
              查看详细错误
            </summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-ink-soft">
              {error.message.slice(0, 2000)}
            </pre>
            {error.digest ? (
              <p className="mt-1 text-[10px] text-ink-soft/70">
                digest: {error.digest}
              </p>
            ) : null}
          </details>
        ) : null}

        <Button className="mt-5" onClick={reset}>
          重试
        </Button>
      </div>
    </div>
  );
}
