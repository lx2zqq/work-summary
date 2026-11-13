const TIME_ZONE = "Asia/Shanghai";

/** 返回上海时区的 YYYY-MM-DD */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** 2026-11-13 -> 2026年11月13日 */
export function formatDateCN(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

/** 2026-11-13 -> 11月13日 */
export function formatDateShort(iso: string): string {
  const [, month, day] = iso.split("-").map(Number);
  return `${month}月${day}日`;
}

/** 2026-11-13 -> 周四 */
export function weekdayCN(iso: string): string {
  const date = new Date(`${iso}T12:00:00+08:00`);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: TIME_ZONE,
    weekday: "short",
  }).format(date);
}

export function addDaysISO(iso: string, delta: number): string {
  const date = new Date(`${iso}T12:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + delta);
  return todayISO(date);
}

/** 今天 / 昨天 / 11月11日 */
export function relativeDateLabel(iso: string): string {
  const today = todayISO();
  if (iso === today) return "今天";
  if (iso === addDaysISO(today, -1)) return "昨天";
  return formatDateShort(iso);
}

export function isToday(iso: string): boolean {
  return iso === todayISO();
}
