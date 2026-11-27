"use client";

import { Archive, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMemoryRemaining } from "@/lib/memory";
import type { Memory } from "@/lib/types";

/** 取最早到期的宽限期，告诉用户还剩几天 */
function deadlineLabel(memories: Memory[]): string {
  const earliest = memories
    .filter((memory) => memory.archiveAfter)
    .sort((a, b) =>
      (a.archiveAfter ?? "").localeCompare(b.archiveAfter ?? ""),
    )[0];

  if (!earliest) return "";

  const remaining = formatMemoryRemaining(earliest.archiveAfter);
  if (!remaining) return "";
  if (remaining === "今天到期") return "今天";

  return `${remaining.replace("剩余 ", "")}后`;
}

type Props = {
  memories: Memory[];
  busyId: string | null;
  onKeep: (id: string) => void;
  onArchive: (id: string) => void;
};

/**
 * 复盘页顶部的待归档提示条。
 * 默认只显示一行摘要，展开后才展示条目，避免打断写作。
 */
export function MemoryArchiveBanner({
  memories,
  busyId,
  onKeep,
  onArchive,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  if (memories.length === 0) return null;

  const deadline = deadlineLabel(memories);
  const busy = busyId !== null;

  return (
    <section className="rounded-2xl border border-butter/60 bg-butter-soft px-3 py-2.5 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex min-w-0 items-start gap-2 text-xs leading-relaxed text-warning-deep sm:items-center">
          <Archive className="mt-0.5 h-3.5 w-3.5 shrink-0 sm:mt-0" />
          <span>
            有 {memories.length} 条阶段性记忆已过时效，
            {deadline
              ? `未选择保留将在${deadline}自动归档`
              : "未选择保留将自动归档"}
          </span>
        </p>

        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-warning-deep underline-offset-2 hover:underline"
          aria-expanded={expanded}
        >
          {expanded ? "收起" : "查看"}
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {expanded ? (
        <ul className="mt-2.5 space-y-2 border-t border-butter/50 pt-2.5">
          {memories.map((memory) => {
            const remaining = formatMemoryRemaining(memory.archiveAfter);

            return (
              <li
                key={memory.id}
                className="rounded-xl bg-paper/70 px-2.5 py-2 sm:px-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {memory.studentName ? (
                        <span className="text-xs font-medium text-ink">
                          {memory.studentName}
                        </span>
                      ) : null}
                      <Badge tone="amber">{memory.category}</Badge>
                      <span className="text-[11px] text-ink-soft">
                        {memory.archiveReason ?? "已过建议时效"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-ink">
                      {memory.content}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-soft">
                      {remaining
                        ? `${remaining}后自动归档`
                        : "宽限期结束后自动归档"}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onKeep(memory.id)}
                      loading={busyId === memory.id}
                      disabled={busy}
                    >
                      保留
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onArchive(memory.id)}
                      disabled={busy}
                    >
                      现在归档
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
