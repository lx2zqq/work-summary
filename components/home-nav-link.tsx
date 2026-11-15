"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { todayISO } from "@/lib/date";
import {
  getSelectedDate,
  getSelectedDateServerSnapshot,
  subscribeSelectedDate,
} from "@/lib/selected-date";

/** “今日复盘”入口：保留最近查看的日期，避免切页后回到今天 */
export function HomeNavLink({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const selectedDate = useSyncExternalStore(
    subscribeSelectedDate,
    getSelectedDate,
    getSelectedDateServerSnapshot,
  );
  const date =
    selectedDate && selectedDate !== todayISO() ? selectedDate : null;

  return (
    <Link href={date ? `/?date=${date}` : "/"} className={className}>
      {children}
    </Link>
  );
}
