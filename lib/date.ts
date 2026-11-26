const TIME_ZONE = "Asia/Shanghai";

// Intl.DateTimeFormat 构造开销较大，模块内复用单例
const isoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const weekdayFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: TIME_ZONE,
  weekday: "short",
});

/** 返回上海时区的 YYYY-MM-DD */
export function todayISO(now: Date = new Date()): string {
  return isoDateFormatter.format(now);
}

/**
 * 校验 YYYY-MM-DD 是否是真实存在的日历日期。
 * 2026-02-30、2026-13-01、2026-00-10 都会返回 false。
 */
export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  // Date.UTC 会把 0-99 年解释为 1900+，这里用 setUTCFullYear 还原
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 100) date.setUTCFullYear(year);

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** 2026-11-13 -> 2026年11月13日；非法输入原样返回 */
export function formatDateCN(iso: string): string {
  if (!isValidISODate(iso)) return iso;

  const [year, month, day] = iso.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

/** 2026-11-13 -> 11月13日；非法输入原样返回 */
export function formatDateShort(iso: string): string {
  if (!isValidISODate(iso)) return iso;

  const [, month, day] = iso.split("-").map(Number);
  return `${month}月${day}日`;
}

/** 2026-11-13 -> 周四；非法输入返回空串 */
export function weekdayCN(iso: string): string {
  if (!isValidISODate(iso)) return "";

  return weekdayFormatter.format(new Date(`${iso}T12:00:00+08:00`));
}

/** 日期加减，非法输入或非法步长时原样返回，避免 Intl 抛 RangeError */
export function addDaysISO(iso: string, delta: number): string {
  if (!isValidISODate(iso) || !Number.isFinite(delta)) return iso;

  const date = new Date(`${iso}T12:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + Math.trunc(delta));
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
