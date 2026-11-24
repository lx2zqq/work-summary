"use client";

import { cn } from "@/lib/utils";

type Option<T extends string> = {
  value: T;
  label: string;
  /** 数量徽标；dot 表示只显示一个小圆点 */
  badge?: number | "dot";
};

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-lg border border-line bg-cream-deep/70 p-0.5",
        className,
      )}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-paper text-ink shadow-sm"
                : "text-ink-soft hover:text-ink",
            )}
          >
            {option.label}
            {option.badge === "dot" ? (
              <>
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-brand"
                />
                <span className="sr-only">有更新</span>
              </>
            ) : typeof option.badge === "number" && option.badge > 0 ? (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[9px] font-semibold leading-none text-white">
                {option.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
