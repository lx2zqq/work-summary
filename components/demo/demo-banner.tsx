"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** 演示页与正式页的对应关系，已登录预览时从这里取返回地址 */
const APP_PATHS: Record<string, string> = {
  "/demo": "/",
  "/demo/history": "/history",
  "/demo/memories": "/memories",
  "/demo/students": "/students",
  "/demo/settings": "/settings",
};

/** 演示模式提示，固定在每个演示页面顶部 */
export function DemoBanner({ isLoggedIn }: { isLoggedIn: boolean }) {
  const pathname = usePathname();
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const appPath = APP_PATHS[normalized] ?? "/";

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-line bg-cream-deep/60 px-4 py-2.5 text-xs leading-relaxed text-ink-soft">
      <span>
        <span className="font-medium text-ink">演示模式</span> ·
        仅展示样例数据，刷新后重置
      </span>
      {isLoggedIn ? (
        <Link
          href={appPath}
          className="underline underline-offset-2 transition-colors hover:text-ink"
        >
          返回正式版 →
        </Link>
      ) : (
        <Link
          href="/login"
          className="underline underline-offset-2 transition-colors hover:text-ink"
        >
          登录 →
        </Link>
      )}
    </div>
  );
}
