"use client";

import { Copy, ExternalLink } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { ChiikawaMascot } from "@/components/mascots";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";
import { formatDateCN, weekdayCN } from "@/lib/date";
import type { ReviewListItem } from "@/lib/types";
import { truncate } from "@/lib/utils";

export function HistoryList({
  items,
  demoMode = false,
}: {
  items: ReviewListItem[];
  /** 演示模式：隐藏“打开”，避免跳回真实工作台 */
  demoMode?: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="paper-card border-dashed px-6 py-14 text-center">
        <ChiikawaMascot className="mascot-float mx-auto h-24 w-24" mood="sad" />
        <p className="mt-3 text-sm font-extrabold text-ink">
          还没有历史复盘
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-full border-2 border-cocoa bg-brand px-4 text-sm font-bold text-cocoa shadow-[0_3px_0_#5b463c] transition-all hover:-translate-y-0.5 hover:bg-[#f7b7c8] hover:shadow-[0_4px_0_#5b463c]"
        >
          去写今天的复盘
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article
          key={item.id}
          className="paper-card p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-butter-soft text-sm font-extrabold text-[#7a5c2a] ring-2 ring-butter/60">
                {Number(item.reviewDate.slice(8, 10))}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-extrabold text-ink">
                    {formatDateCN(item.reviewDate)}
                  </h2>
                  <span className="text-[11px] text-ink-soft">
                    {weekdayCN(item.reviewDate)}
                  </span>
                  <Badge tone="stone">
                    {item.style === "concise" ? "简洁" : "详细"}
                  </Badge>
                  {item.questions > 0 ? (
                    <Badge tone="amber">待补全</Badge>
                  ) : null}
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-soft">
                  {item.questions > 0
                    ? `还有 ${item.questions} 个追问未完成，点开继续。`
                    : item.finalText.trim()
                      ? truncate(item.finalText, 160)
                      : "（这篇还没有内容）"}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                disabled={item.questions > 0 || !item.finalText.trim()}
                onClick={async () => {
                  const okay = await copyText(item.finalText);
                  if (okay) toast.success("已复制");
                  else toast.error("复制失败，请打开后手动复制");
                }}
              >
                <Copy className="h-4 w-4" />
                复制
              </Button>
              {demoMode ? null : (
                <Link
                  href={`/?date=${item.reviewDate}`}
                  className="inline-flex h-9 items-center gap-2 rounded-full border-2 border-line bg-paper px-3.5 text-xs font-bold text-ink-soft shadow-[0_3px_0_#eadccd] transition-all hover:-translate-y-0.5 hover:bg-cream hover:text-ink active:translate-y-0.5 active:shadow-none"
                >
                  <ExternalLink className="h-4 w-4" />
                  打开
                </Link>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
