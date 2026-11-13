import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession();

  // AppShell 内部使用 usePathname；Next 16 在 Vercel 上需要 Suspense 边界，
  // 否则页面可能在服务端一直挂起，最终触发 300 秒运行时超时。
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
