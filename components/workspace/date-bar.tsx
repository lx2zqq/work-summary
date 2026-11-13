"use client";

import {
  CalendarDays,
  Check,
  CloudOff,
  Loader2,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { relativeDateLabel, todayISO, weekdayCN } from "@/lib/date";
import type { ReviewStyle } from "@/lib/types";
import { cn, formatSavedAt } from "@/lib/utils";

type Props = {
  date: string;
  style: ReviewStyle;
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  savedAt: string | null;
  saveFailed?: boolean;
  onDateChange: (date: string) => void;
  onStyleChange: (style: ReviewStyle) => void;
  onSave: () => void;
};

export function DateBar({
  date,
  style,
  loading,
  saving,
  dirty,
  savedAt,
  saveFailed = false,
  onDateChange,
  onStyleChange,
  onSave,
}: Props) {
  return (
    <div className="paper-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <div className="flex items-center gap-2.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-butter-soft text-[#8a6a2f] ring-2 ring-butter/60">
          <CalendarDays className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={date}
              max={todayISO()}
              disabled={loading}
              onChange={(event) => {
                if (event.target.value) onDateChange(event.target.value);
              }}
              className="h-8 w-[148px] rounded-full px-3 text-sm font-bold"
              aria-label="复盘日期"
            />
            <span className="text-[11px] text-ink-soft">
              {relativeDateLabel(date)} · {weekdayCN(date)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-soft">
            {saving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                保存中…
              </>
            ) : saveFailed ? (
              <>
                <CloudOff className="h-3 w-3 text-[#b35454]" />
                <span className="text-[#b35454]">
                  自动保存失败，点“保存”重试
                </span>
              </>
            ) : dirty ? (
              <>
                <CloudOff className="h-3 w-3 text-[#b07a2a]" />
                有改动，稍后自动保存
              </>
            ) : savedAt ? (
              <>
                <Check className="h-3 w-3 text-[#4f7d63]" />
                已保存 {formatSavedAt(savedAt)}
              </>
            ) : (
              <>尚未保存</>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <div
          className={cn(
            "transition-opacity",
            loading && "pointer-events-none opacity-50",
          )}
        >
          <Segmented
            options={[
              { value: "concise", label: "简洁" },
              { value: "detailed", label: "详细" },
            ]}
            value={style}
            onChange={onStyleChange}
            ariaLabel="文风"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSave}
          disabled={(!dirty && !saveFailed) || saving || loading}
        >
          <Save className="h-4 w-4" />
          保存
        </Button>
      </div>
    </div>
  );
}
