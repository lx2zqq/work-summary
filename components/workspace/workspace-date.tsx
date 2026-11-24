"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateText } from "@/components/ui/date-text";
import { addDaysISO, weekdayCN } from "@/lib/date";
import { cn } from "@/lib/utils";

export type SaveStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "archived"
  | "failed";

const STATUS_META: Record<
  Exclude<SaveStatus, "idle">,
  { dot: string; text: string }
> = {
  dirty: { dot: "bg-brand", text: "有改动" },
  saving: { dot: "bg-brand animate-pulse", text: "正在暂存" },
  saved: { dot: "bg-ink-soft/50", text: "已自动暂存" },
  archived: { dot: "bg-[#4f7d63]", text: "已归档" },
  failed: { dot: "bg-[#a94b42]", text: "暂存失败" },
};

export function WorkspaceDate({
  date,
  today,
  status,
  switching,
  canSave,
  loading,
  readOnly = false,
  onDateChange,
  onSave,
}: {
  date: string;
  today: string;
  status: SaveStatus;
  switching: boolean;
  canSave: boolean;
  loading: boolean;
  /** 演示模式：只展示日期，不提供切换和保存 */
  readOnly?: boolean;
  onDateChange: (date: string) => void;
  onSave: () => void;
}) {
  const previousDate = addDaysISO(date, -1);
  const nextDate = addDaysISO(date, 1);
  const canGoNext = date < today;

  const dateLabel = (
    <span className="flex items-baseline gap-1.5">
      <DateText
        iso={date}
        className="text-[17px] font-medium text-ink"
        numeralClassName="font-serif text-[1.18em] font-normal tracking-[-0.01em]"
      />
      <span className="text-xs text-ink-soft">{weekdayCN(date)}</span>
    </span>
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 px-3 py-2.5 sm:px-4 sm:py-3">
      {readOnly ? (
        <div className="px-1 py-1">{dateLabel}</div>
      ) : (
        <div className="flex min-w-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label="前一天"
            disabled={loading}
            onClick={() => onDateChange(previousDate)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="relative rounded-md px-2 py-1 transition-colors hover:bg-cream-deep/60">
            <input
              type="date"
              value={date}
              max={today}
              disabled={loading}
              aria-label="选择复盘日期"
              onChange={(event) => {
                if (event.target.value) onDateChange(event.target.value);
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
            <span className="pointer-events-none">{dateLabel}</span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            aria-label="后一天"
            disabled={!canGoNext || loading}
            onClick={() => onDateChange(nextDate)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          {date !== today ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => onDateChange(today)}
              className="ml-1 rounded-md px-2 py-1 text-[11px] font-medium text-brand-deep transition-colors hover:bg-brand-soft disabled:opacity-50"
            >
              回到今天
            </button>
          ) : null}
        </div>
      )}

      {readOnly ? null : (
        <div className="flex items-center gap-2">
          {switching ? (
            <span className="text-[11px] text-ink-soft">正在切换日期…</span>
          ) : status !== "idle" ? (
            <span className="flex items-center gap-1.5 text-[11px] text-ink-soft">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  STATUS_META[status].dot,
                )}
              />
              {STATUS_META[status].text}
            </span>
          ) : null}

          <Button
            variant="ghost"
            size="sm"
            onClick={onSave}
            disabled={!canSave || loading || status === "saving"}
            title="保存并归档到历史"
          >
            保存
          </Button>
        </div>
      )}
    </div>
  );
}
