"use client";

import {
  Brain,
  ClipboardList,
  History,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { todayISO } from "@/lib/date";
import {
  getSelectedDate,
  getSelectedDateServerSnapshot,
  subscribeSelectedDate,
} from "@/lib/selected-date";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const NAV: NavItem[] = [
  { href: "/", label: "今日复盘", icon: ClipboardList },
  { href: "/history", label: "历史", icon: History },
  { href: "/memories", label: "记忆", icon: Brain },
  { href: "/students", label: "学生", icon: Users },
  { href: "/settings", label: "设置", icon: Settings },
];

/**
 * 统一计算导航高亮和链接地址。
 * 演示路由（/demo/*）去掉前缀后按同一套规则匹配，保证游客也能看到选中态。
 */
function useNavState(basePath: string) {
  const pathname = usePathname() ?? "/";
  const selectedDate = useSyncExternalStore(
    subscribeSelectedDate,
    getSelectedDate,
    getSelectedDateServerSnapshot,
  );

  const relative =
    basePath && pathname.startsWith(basePath)
      ? pathname.slice(basePath.length) || "/"
      : pathname;

  const isActive = (href: string) =>
    href === "/"
      ? relative === "/"
      : relative === href || relative.startsWith(`${href}/`);

  const hrefFor = (href: string) => {
    if (href !== "/") return `${basePath}${href}`;
    if (basePath) return basePath;

    const date =
      selectedDate && selectedDate !== todayISO() ? selectedDate : null;

    return date ? `/?date=${date}` : "/";
  };

  return { isActive, hrefFor };
}

export function BrandHomeLink({
  basePath = "",
  className,
  children,
}: {
  basePath?: string;
  className?: string;
  children: ReactNode;
}) {
  const { hrefFor } = useNavState(basePath);

  return (
    <Link href={hrefFor("/")} className={className}>
      {children}
    </Link>
  );
}

export function DesktopNav({ basePath = "" }: { basePath?: string }) {
  const { isActive, hrefFor } = useNavState(basePath);

  return (
    <nav className="hidden items-center gap-1 md:flex">
      {NAV.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href);

        return (
          <Link
            key={item.href}
            href={hrefFor(item.href)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-brand-soft text-brand-deep"
                : "text-ink-soft hover:bg-cream-deep/60 hover:text-ink",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav({ basePath = "" }: { basePath?: string }) {
  const { isActive, hrefFor } = useNavState(basePath);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
      <div className="grid grid-cols-5">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={hrefFor(item.href)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors",
                active ? "text-brand-deep" : "text-ink-soft",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
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
  );
}
