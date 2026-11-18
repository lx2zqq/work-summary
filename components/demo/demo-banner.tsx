import Link from "next/link";

/** 演示模式提示，固定在每个演示页面顶部 */
export function DemoBanner() {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl border-2 border-brand/40 bg-brand-soft px-4 py-2.5 text-xs font-bold leading-relaxed text-brand-deep">
      <span>演示模式 · 数据都是预置样例，不调用模型，刷新后恢复</span>
      <Link
        href="/login"
        className="underline underline-offset-2 hover:text-brand"
      >
        登录使用完整功能 →
      </Link>
    </div>
  );
}
