import Link from "next/link";

/** 演示模式提示，固定在每个演示页面顶部 */
export function DemoBanner() {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-line bg-cream-deep/60 px-4 py-2.5 text-xs leading-relaxed text-ink-soft">
      <span>
        <span className="font-medium text-ink">演示模式</span> ·
        仅展示样例数据，刷新后重置
      </span>
      <Link
        href="/login"
        className="underline underline-offset-2 transition-colors hover:text-ink"
      >
        登录 →
      </Link>
    </div>
  );
}
