"use client";

import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Copy,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChiikawaMascot } from "@/components/mascots";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MonthText } from "@/components/ui/date-text";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import { copyText } from "@/lib/clipboard";
import { formatDateCN, weekdayCN } from "@/lib/date";
import {
  dayOfMonth,
  matchStudents,
  reviewSummary,
} from "@/lib/review-text";
import type { ReviewListItem, Student } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ReviewStats = {
  total: number;
  monthDays: number;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 搜索词在摘要里柔和高亮，保留原文本给屏幕阅读器 */
function highlightKeyword(text: string, keyword: string) {
  const needle = keyword.trim();
  if (!needle) return text;

  const pattern = new RegExp(`(${escapeRegExp(needle)})`, "gi");

  return text.split(pattern).map((part, index) =>
    part.toLowerCase() === needle.toLowerCase() ? (
      <mark
        key={`${part}-${index}`}
        className="rounded-sm bg-butter-soft px-0.5 text-ink"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export function HistoryList({
  items,
  students,
  stats,
  demoMode = false,
}: {
  items: ReviewListItem[];
  students: Student[];
  stats: ReviewStats;
  /** 演示模式：隐藏「打开」和「删除」 */
  demoMode?: boolean;
}) {
  const [list, setList] = useState(items);
  const [total, setTotal] = useState(stats.total);
  const [query, setQuery] = useState("");
  const [studentId, setStudentId] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [deleteTarget, setDeleteTarget] = useState<ReviewListItem | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const keyword = query.trim();
    const studentName =
      students.find((student) => student.id === studentId)?.name ?? "";

    return list.filter((item) => {
      if (studentName && !item.finalText.includes(studentName)) return false;
      if (keyword && !item.finalText.includes(keyword)) return false;
      return true;
    });
  }, [list, query, studentId, students]);

  const groups = useMemo(() => {
    const map = new Map<string, ReviewListItem[]>();

    for (const item of filtered) {
      const month = item.reviewDate.slice(0, 7);
      const bucket = map.get(month) ?? [];
      bucket.push(item);
      map.set(month, bucket);
    }

    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const filtering = Boolean(query.trim() || studentId);

  function clearFilters() {
    setQuery("");
    setStudentId("");
  }

  function toggleExpanded(id: string) {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function copyReview(item: ReviewListItem) {
    const okay = await copyText(item.finalText);

    if (okay) toast.success("已复制");
    else toast.error("复制失败，请打开后手动复制");
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    setDeleting(true);

    try {
      const response = await fetch(`/api/reviews/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "删除失败");
      }

      setList((previous) =>
        previous.filter((item) => item.id !== deleteTarget.id),
      );
      setTotal((previous) => Math.max(0, previous - 1));
      setExpandedIds((previous) => {
        if (!previous.has(deleteTarget.id)) return previous;
        const next = new Set(previous);
        next.delete(deleteTarget.id);
        return next;
      });
      setDeleteTarget(null);
      toast.success("已删除这篇复盘");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  }

  if (list.length === 0) {
    return (
      <div className="paper-card border-dashed px-6 py-14 text-center">
        <ChiikawaMascot className="mx-auto h-20 w-20" mood="sad" />
        <p className="mt-3 text-sm font-medium text-ink">还没有历史复盘</p>
        <Link
          href={demoMode ? "/demo" : "/"}
          className={buttonClass({ className: "mt-4" })}
        >
          去写今天的复盘
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            历史复盘
          </h1>
          <span className="text-xs text-ink-soft">共 {total} 篇</span>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <SearchInput
            value={query}
            onValueChange={setQuery}
            placeholder="搜索复盘内容…"
            className="min-w-0 flex-1 sm:w-56 sm:flex-none"
          />

          <Select
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
            className="h-9 w-28 text-xs"
            aria-label="按学生筛选"
          >
            <option value="">全部学生</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name}
              </option>
            ))}
          </Select>

          {filtering ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              清除
            </Button>
          ) : null}
        </div>
      </div>

      {filtering ? (
        <p className="text-[11px] text-ink-soft">
          筛选出 <span className="text-ink">{filtered.length}</span> 篇
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <div className="paper-card px-6 py-12 text-center">
          <p className="text-sm text-ink-soft">没有匹配的复盘</p>
          <Button variant="ghost" size="sm" className="mt-3" onClick={clearFilters}>
            清除筛选
          </Button>
        </div>
      ) : (
        <div className="space-y-7">
          {groups.map(([month, monthItems]) => (
            <section key={month} className="space-y-3">
              <div className="sticky top-16 z-20 -mx-1 flex items-center gap-3 bg-cream/90 px-1 py-1 backdrop-blur-sm">
                <MonthText
                  month={month}
                  className="text-sm font-medium text-ink"
                />
                <span className="h-px flex-1 bg-line/80" />
                <span className="text-[11px] text-ink-soft">
                  {monthItems.length} 篇
                </span>
              </div>

              <div className="space-y-3">
                {monthItems.map((item, index) => {
                  const mentioned = matchStudents(
                    item.finalText,
                    students,
                  );
                  const isLast = index === monthItems.length - 1;
                  const canExpand =
                    item.questions === 0 && Boolean(item.finalText.trim());
                  const expanded = expandedIds.has(item.id);
                  const summary =
                    item.questions > 0
                      ? demoMode
                        ? `还有 ${item.questions} 个追问未完成。`
                        : `还有 ${item.questions} 个追问未完成，点开继续。`
                      : reviewSummary(item.finalText, 2) ||
                        "（这篇还没有内容）";

                  const body = (
                    <>
                      {item.questions > 0 ? (
                        <Badge tone="amber">待补全</Badge>
                      ) : null}

                      <span
                        className={cn(
                          "flex items-start gap-1.5",
                          item.questions > 0 && "mt-1.5",
                        )}
                      >
                        <span className="line-clamp-2 min-w-0 flex-1 text-sm leading-relaxed text-ink">
                          {highlightKeyword(summary, query)}
                        </span>
                        {canExpand ? (
                          <ChevronDown
                            aria-hidden
                            className={cn(
                              "mt-0.5 h-4 w-4 shrink-0 text-ink-soft/60 transition-transform",
                              expanded && "rotate-180",
                            )}
                          />
                        ) : null}
                      </span>

                      {mentioned.length > 0 ? (
                        <span className="mt-2 flex flex-wrap gap-1.5">
                          {mentioned.slice(0, 6).map((student) => (
                            <span
                              key={student.id}
                              className="rounded-full bg-cream-deep/80 px-2 py-0.5 text-[10px] text-ink-soft"
                            >
                              {student.name}
                            </span>
                          ))}
                          {mentioned.length > 6 ? (
                            <span className="rounded-full bg-cream-deep/80 px-2 py-0.5 text-[10px] text-ink-soft">
                              +{mentioned.length - 6}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                    </>
                  );

                  return (
                    <div key={item.id} className="flex gap-3">
                      <div className="flex w-11 shrink-0 flex-col items-center pt-3">
                        <span className="font-serif text-xl leading-none text-ink">
                          {dayOfMonth(item.reviewDate)}
                        </span>
                        <span className="mt-0.5 text-[10px] text-ink-soft">
                          {weekdayCN(item.reviewDate)}
                        </span>
                        {!isLast ? (
                          <span className="mt-2 w-px flex-1 bg-line/70" />
                        ) : null}
                      </div>

                      <article className="paper-card min-w-0 flex-1 p-4 transition-colors hover:border-brand/30">
                        <div className="flex items-start justify-between gap-2">
                          {canExpand ? (
                            <button
                              type="button"
                              aria-expanded={expanded}
                              aria-controls={`review-body-${item.id}`}
                              onClick={() => toggleExpanded(item.id)}
                              className="min-w-0 flex-1 cursor-pointer rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                            >
                              {body}
                            </button>
                          ) : demoMode ? (
                            <div className="min-w-0 flex-1">{body}</div>
                          ) : (
                            <Link
                              href={`/?date=${item.reviewDate}`}
                              aria-label={`打开 ${formatDateCN(item.reviewDate)} 的复盘`}
                              className="min-w-0 flex-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                            >
                              {body}
                            </Link>
                          )}

                          <div className="flex shrink-0 items-center gap-0.5">
                            {canExpand ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="复制这篇复盘"
                                aria-label={`复制 ${formatDateCN(item.reviewDate)} 的复盘`}
                                onClick={() => {
                                  void copyReview(item);
                                }}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            ) : null}

                            {demoMode ? null : (
                              <>
                                <Link
                                  href={`/?date=${item.reviewDate}`}
                                  title="打开这篇复盘"
                                  aria-label={`打开 ${formatDateCN(item.reviewDate)} 的复盘`}
                                  className={buttonClass({
                                    variant: "ghost",
                                    size: "icon",
                                  })}
                                >
                                  <ArrowUpRight className="h-4 w-4" />
                                </Link>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="删除这篇复盘"
                                  aria-label={`删除 ${formatDateCN(item.reviewDate)} 的复盘`}
                                  onClick={() => setDeleteTarget(item)}
                                >
                                  <Trash2 className="h-4 w-4 text-danger" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>

                        {expanded ? (
                          <div
                            id={`review-body-${item.id}`}
                            className="mt-2.5 rounded-xl bg-cream/60 p-3.5"
                          >
                            <pre className="review-text text-sm leading-relaxed text-ink">
                              {highlightKeyword(item.finalText, query)}
                            </pre>

                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2.5">
                              <button
                                type="button"
                                onClick={() => toggleExpanded(item.id)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
                              >
                                <ChevronUp className="h-3.5 w-3.5" />
                                收起
                              </button>

                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    void copyReview(item);
                                  }}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                  复制全文
                                </button>
                                {demoMode ? null : (
                                  <Link
                                    href={`/?date=${item.reviewDate}`}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-deep transition-colors hover:underline"
                                  >
                                    去编辑
                                    <ArrowUpRight className="h-3.5 w-3.5" />
                                  </Link>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </article>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null);
        }}
        title="删除这篇复盘？"
        description={
          deleteTarget
            ? `${formatDateCN(deleteTarget.reviewDate)} 的复盘会被永久删除，长期记忆不受影响。`
            : undefined
        }
        loading={deleting}
        onConfirm={() => {
          void handleDelete();
        }}
      />
    </div>
  );
}
