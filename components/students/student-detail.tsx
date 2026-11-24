"use client";

import { ArrowUpRight, Brain, FileText } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { avatarTone } from "@/lib/avatar-tone";
import { formatDateCN } from "@/lib/date";
import { formatMemoryImportance } from "@/lib/memory";
import { reviewSummary } from "@/lib/review-text";
import type { Memory, ReviewSnippet, Student, StudentStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<
  StudentStatus,
  "green" | "amber" | "blue" | "stone"
> = {
  在读: "green",
  停课: "amber",
  潜在: "blue",
  已结课: "stone",
};

export function StudentDetail({
  student,
  open,
  onOpenChange,
  memories,
  reviews,
  demoMode = false,
}: {
  student: Student | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memories: Memory[];
  reviews: ReviewSnippet[];
  demoMode?: boolean;
}) {
  if (!student) return null;

  const lastReview = reviews[0]?.reviewDate ?? null;
  const lastReviewShort = lastReview
    ? lastReview.slice(5).replace("-", "/")
    : null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        leading={
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl text-sm font-medium",
              avatarTone(student.name),
            )}
          >
            {student.name.slice(0, 1)}
          </div>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            {student.name}
            <Badge tone={STATUS_TONE[student.status] ?? "stone"}>
              {student.status}
            </Badge>
          </span>
        }
        description={[student.grade, student.subjects]
          .filter(Boolean)
          .join(" · ") || "还没有填写年级和科目"}
      >
        {student.note ? (
          <p className="mb-4 text-xs leading-relaxed text-ink-soft">
            {student.note}
          </p>
        ) : null}

        <div className="grid grid-cols-3 divide-x divide-line/70 rounded-xl border border-line/60 bg-cream/50 py-3 text-center">
          <div>
            <p className="flex h-6 items-center justify-center font-serif text-xl leading-none text-ink tabular-nums">
              {memories.length}
            </p>
            <p className="mt-1 text-[10px] text-ink-soft">长期记忆</p>
          </div>
          <div>
            <p className="flex h-6 items-center justify-center font-serif text-xl leading-none text-ink tabular-nums">
              {reviews.length}
            </p>
            <p className="mt-1 text-[10px] text-ink-soft">相关复盘</p>
          </div>
          <div>
            <p
              className="flex h-6 items-center justify-center font-serif text-xl leading-none text-ink tabular-nums"
              title={lastReview ? formatDateCN(lastReview) : "还没有相关复盘"}
            >
              {lastReviewShort ?? (
                <span className="font-sans text-sm text-ink-soft">暂无</span>
              )}
            </p>
            <p className="mt-1 text-[10px] text-ink-soft">最近跟进</p>
          </div>
        </div>

        <section className="mt-5">
          <h3 className="flex items-center gap-1.5 text-xs font-medium text-ink-soft">
            <Brain className="h-3.5 w-3.5" />
            长期记忆
          </h3>

          <div className="mt-2 space-y-2">
            {memories.length === 0 ? (
              <p className="rounded-lg bg-cream-deep/40 px-3 py-2 text-xs text-ink-soft">
                还没有这个学生的长期记忆。
              </p>
            ) : (
              memories.map((memory) => {
                const importance = formatMemoryImportance(memory.importance);

                return (
                  <div
                    key={memory.id}
                    className="rounded-lg border border-line/60 bg-cream/40 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="blue">{memory.category}</Badge>
                      <span
                        className="flex items-center gap-1 text-[10px] text-ink-soft"
                        title={`重要度：${importance.label}`}
                        aria-label={`重要度：${importance.label}`}
                      >
                        <span className="tracking-[0.18em] text-brand-deep">
                          {importance.dots}
                        </span>
                        {importance.label}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-ink">
                      {memory.content}
                    </p>
                    <p className="mt-1 text-[10px] text-ink-soft">
                      {memory.sourceDate
                        ? formatDateCN(memory.sourceDate)
                        : "手动添加"}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="mt-5">
          <h3 className="flex items-center gap-1.5 text-xs font-medium text-ink-soft">
            <FileText className="h-3.5 w-3.5" />
            相关复盘
          </h3>

          <div className="mt-2 space-y-2">
            {reviews.length === 0 ? (
              <p className="rounded-lg bg-cream-deep/40 px-3 py-2 text-xs text-ink-soft">
                复盘正文里还没有提到这个学生。
              </p>
            ) : (
              reviews.slice(0, 10).map((review) => (
                <div
                  key={review.id}
                  className="rounded-lg border border-line/60 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-ink">
                      {formatDateCN(review.reviewDate)}
                    </span>
                    {demoMode ? null : (
                      <Link
                        href={`/?date=${review.reviewDate}`}
                        className="inline-flex items-center gap-0.5 text-[11px] text-brand-deep hover:underline"
                      >
                        打开
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-ink-soft">
                    {reviewSummary(review.finalText, 2)}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </DrawerContent>
    </Drawer>
  );
}
