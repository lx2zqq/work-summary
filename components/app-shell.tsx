import {
  BrandHomeLink,
  DesktopNav,
  MobileNav,
} from "@/components/app-nav";
import { MascotFace } from "@/components/mascots";
import { GenerationIndicator } from "@/components/workspace/generation-indicator";

export function AppShell({
  children,
  basePath = "",
}: {
  children: React.ReactNode;
  /** 演示模式传 "/demo"，所有导航都指到演示路由 */
  basePath?: string;
}) {
  const isDemo = basePath.length > 0;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-cream/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <BrandHomeLink
            basePath={basePath}
            className="group flex items-center gap-2.5"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft ring-1 ring-line transition-transform group-hover:-rotate-2">
              <MascotFace className="h-8 w-8" />
            </span>
            <span className="leading-tight">
              <span className="block text-[15px] font-semibold tracking-tight text-ink">
                学管复盘助手
              </span>
              <span className="block text-[11px] text-ink-soft">
                今天的流水账，变成规范的复盘
              </span>
            </span>
          </BrandHomeLink>

          <div className="flex items-center gap-2">
            {isDemo ? null : <GenerationIndicator />}
            <DesktopNav basePath={basePath} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6 sm:pt-6 md:pb-12">
        {children}
      </main>

      <MobileNav basePath={basePath} />
    </div>
  );
}
