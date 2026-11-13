"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  History,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { DoodleStar, MascotFace } from "@/components/mascots";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const NAV: NavItem[] = [
  { href: "/", label: "今日复盘", icon: ClipboardList },
  { href: "/history", label: "历史", icon: History },
  { href: "/students", label: "学生", icon: Users },
  { href: "/settings", label: "设置", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b-2 border-line/70 bg-cream/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="group flex items-center gap-2.5">
            <span className="relative flex h-11 w-11 items-center justify-center rounded-full border-2 border-cocoa/20 bg-brand-soft shadow-[0_3px_0_#f0d4dd] transition-transform group-hover:-rotate-3">
              <MascotFace className="h-9 w-9" />
              <DoodleStar className="absolute -right-1 -top-1 h-3.5 w-3.5 text-butter" />
            </span>
            <span className="leading-tight">
              <span className="block text-[15px] font-extrabold tracking-tight text-ink">
                学管复盘助手
              </span>
              <span className="block text-[11px] text-ink-soft">
                今天的流水账，变成规范的复盘
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1.5 md:flex">
            {NAV.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-all",
                    active
                      ? "bg-brand-soft text-brand-deep ring-2 ring-brand/50"
                      : "text-ink-soft hover:bg-cream-deep hover:text-ink",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-44 pt-5 sm:px-6 sm:pt-6 md:pb-12">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-line/70 bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <div className="grid grid-cols-4">
          {NAV.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 text-[11px] font-bold transition-colors",
                  active ? "text-brand-deep" : "text-ink-soft",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
                    active ? "bg-brand-soft" : "bg-transparent",
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
