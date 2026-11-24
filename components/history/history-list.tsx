"use client";

import { ArrowUpRight, Copy, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChiikawaMascot } from "@/components/mascots";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { MonthText } from "@/components/ui/date-text";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  const [localStats, setLocalStats] = useState(stats);
  const [query, setQuery] = useState("");
  const [studentId, setStudentId] = useState("");
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
      setLocalStats((previous) => ({
        ...previous,
        total: Math.max(0, previous.total - 1),
      }));
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            历史复盘
          </h1>
          <span className="mb-0.5 inline-flex items-center rounded-full bg-cream-deep px-2.5 py-1 text-[11px] text-ink-soft">
            共{" "}
            <span className="mx-0.5 font-serif text-[1.25em] leading-none text-ink">
              {localStats.total}
            </span>{" "}
            篇复盘 · 本月{" "}
            <span className="mx-0.5 font-serif text-[1.25em] leading-none text-ink">
              {localStats.monthDays}
            </span>{" "}
            天
          </span>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-soft/60" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索复盘内容…"
              className="h-9 pl-8 text-xs"
            />
          </div>

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
                  const summary =
                    item.questions > 0
                      ? demoMode
                        ? `还有 ${item.questions} 个追问未完成。`
                        : `还有 ${item.questions} 个追问未完成，点开继续。`
                      : reviewSummary(item.finalText, 2) ||
                        "（这篇还没有内容）";
                  const canCopy =
                    item.questions === 0 && Boolean(item.finalText.trim());
                  const hasActions = canCopy || !demoMode;

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

                      <article
                        className={cn(
                          "paper-card relative min-w-0 flex-1 p-4 transition-colors hover:border-brand/30",
                          hasActions &&
                            (demoMode ? "pr-14" : "pr-[7.25rem]"),
                        )}
                      >
                        {demoMode ? null : (
                          <Link
                            href={`/?date=${item.reviewDate}`}
                            aria-label={`打开 ${formatDateCN(item.reviewDate)} 的复盘`}
                            className="absolute inset-0 z-10 rounded-2xl"
                          />
                        )}

                        <div className="pointer-events-none relative">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone="stone">
                              {item.style === "concise" ? "简洁" : "详细"}
                            </Badge>
                            {item.questions > 0 ? (
                              <Badge tone="amber">待补全</Badge>
                            ) : null}
                          </div>

                          <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-ink-soft">
                            {summary}
                          </p>

                          {mentioned.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
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
                            </div>
                          ) : null}
                        </div>

                        <div className="absolute right-3 top-3 z-20 flex items-center gap-0.5">
                          {canCopy ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="复制这篇复盘"
                              aria-label={`复制 ${formatDateCN(item.reviewDate)} 的复盘`}
                              onClick={async () => {
                                const okay = await copyText(item.finalText);
                                if (okay) toast.success("已复制");
                                else toast.error("复制失败，请打开后手动复制");
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
                                <Trash2 className="h-4 w-4 text-[#a94b42]" />
                              </Button>
                            </>
                          )}
                        </div>
                      </article>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null);
        }}
      >
        <DialogContent
          title="删除这篇复盘？"
          description={
            deleteTarget
              ? `${formatDateCN(deleteTarget.reviewDate)} 的复盘会被永久删除，长期记忆不受影响。`
              : undefined
          }
        >
          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              取消
            </Button>
            <Button
              variant="danger"
              loading={deleting}
              onClick={() => {
                void handleDelete();
              }}
            >
              确认删除
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
