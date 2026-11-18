import { AppShell } from "@/components/app-shell";
import { DemoBanner } from "@/components/demo/demo-banner";
import { DemoProvider } from "@/components/demo/demo-provider";
import { todayISO } from "@/lib/date";

// 每次请求都算一次“今天”，保证服务端渲染和浏览器水合用的是同一个日期
export const dynamic = "force-dynamic";

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DemoProvider today={todayISO()}>
      <AppShell basePath="/demo">
        <DemoBanner />
        {children}
      </AppShell>
    </DemoProvider>
  );
}
