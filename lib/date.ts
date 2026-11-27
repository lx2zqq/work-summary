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

export type WeekRange = {
  weekStart: string;
  weekEnd: string;
};

/** ISO 日期所在星期的数字：0=周日、1=周一……6=周六 */
function weekdayIndex(iso: string): number {
  // 12:00 +08:00 对应同一天的 04:00 UTC，getUTCDay 与上海时区星期一致
  return new Date(`${iso}T12:00:00+08:00`).getUTCDay();
}

/** 指定日期所在自然周，周一到周日；非法日期按今天处理 */
export function getWeekRange(dateStr?: string): WeekRange {
  const base = dateStr && isValidISODate(dateStr) ? dateStr : todayISO();
  const offsetFromMonday = (weekdayIndex(base) + 6) % 7;
  const weekStart = addDaysISO(base, -offsetFromMonday);

  return { weekStart, weekEnd: addDaysISO(weekStart, 6) };
}

/**
 * 周报默认周次：周一默认上一周，方便周一补上周的周报；
 * 周二到周日默认本周。
 */
export function getDefaultWeeklyReportRange(now: Date = new Date()): WeekRange & {
  isMondayDefaultLastWeek: boolean;
} {
  const today = todayISO(now);
  const isMondayDefaultLastWeek = weekdayIndex(today) === 1;
  const base = isMondayDefaultLastWeek ? addDaysISO(today, -7) : today;

  return { ...getWeekRange(base), isMondayDefaultLastWeek };
}

/** 以周一为基准前后移动整周；非法输入按本周处理 */
export function shiftWeek(weekStart: string, offsetWeeks: number): WeekRange {
  const { weekStart: normalized } = getWeekRange(weekStart);
  const weeks = Number.isFinite(offsetWeeks) ? Math.trunc(offsetWeeks) : 0;
  const start = addDaysISO(normalized, weeks * 7);

  return { weekStart: start, weekEnd: addDaysISO(start, 6) };
}
