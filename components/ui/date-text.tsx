import { cn } from "@/lib/utils";

const separatorClassName =
  "mx-[0.1em] text-[0.68em] font-normal text-ink-soft";

/** 中文用无衬线，数字用 Instrument Serif，做出编辑感 */
export function DateText({
  iso,
  className,
  numeralClassName = "font-serif text-[1.16em] font-normal tracking-[-0.01em]",
}: {
  iso: string;
  className?: string;
  numeralClassName?: string;
}) {
  const [year, month, day] = iso.split("-").map(Number);

  return (
    <span
      className={cn(
        "inline-flex items-baseline tabular-nums",
        className,
      )}
    >
      <span className={numeralClassName}>{year}</span>
      <span className={separatorClassName}>年</span>
      <span className={numeralClassName}>{month}</span>
      <span className={separatorClassName}>月</span>
      <span className={numeralClassName}>{day}</span>
      <span className={separatorClassName}>日</span>
    </span>
  );
}

/** 2026-11 → 2026年11月，供月份分组标题使用 */
export function MonthText({
  month,
  className,
  numeralClassName = "font-serif text-[1.12em] font-normal tracking-[-0.01em]",
}: {
  /** YYYY-MM */
  month: string;
  className?: string;
  numeralClassName?: string;
}) {
  const [year, value] = month.split("-").map(Number);

  return (
    <span
      className={cn(
        "inline-flex items-baseline tabular-nums",
        className,
      )}
    >
      <span className={numeralClassName}>{year}</span>
      <span className={separatorClassName}>年</span>
      <span className={numeralClassName}>{value}</span>
      <span className={separatorClassName}>月</span>
    </span>
  );
}
