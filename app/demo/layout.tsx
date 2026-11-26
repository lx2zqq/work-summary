import { AppShell } from "@/components/app-shell";
import { DemoBanner } from "@/components/demo/demo-banner";
import { DemoProvider } from "@/components/demo/demo-provider";
import { getSession } from "@/lib/auth";
import { todayISO } from "@/lib/date";

// 每次请求都算一次“今天”，保证服务端渲染和浏览器水合用的是同一个日期
export const dynamic = "force-dynamic";

export default async function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  return (
    <DemoProvider today={todayISO()}>
      <AppShell basePath="/demo">
        <DemoBanner isLoggedIn={Boolean(session)} />
        {children}
      </AppShell>
    </DemoProvider>
  );
}
