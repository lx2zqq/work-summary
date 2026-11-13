"use client";

import { Check, Copy, Pencil, RefreshCw } from "lucide-react";
import {
  ChiikawaMascot,
  DoodleStar,
  UsagiMascot,
} from "@/components/mascots";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type Props = {
  finalText: string;
  hasContent: boolean;
  waitingForAnswers: boolean;
  loading: boolean;
  loadingMessage: string;
  notes: string[];
  onCopy: () => void;
  onEdit: () => void;
  onRegenerate: () => void;
};

export function DraftCard({
  finalText,
  hasContent,
  waitingForAnswers,
  loading,
  loadingMessage,
  notes,
  onCopy,
  onEdit,
  onRegenerate,
}: Props) {
  return (
    <section className="paper-card relative flex min-h-[540px] flex-col">
      <span className="washi-tape" />

      <div className="flex items-center justify-between gap-2 border-b-2 border-line/60 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft ring-2 ring-brand/40">
            <ChiikawaMascot className="h-8 w-8" />
          </div>
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-extrabold text-ink">
              复盘预览
              <DoodleStar className="h-3 w-3 text-butter" />
            </h2>
            <p className="text-[11px] text-ink-soft">
              复制后直接粘贴到钉钉工作群
            </p>
          </div>
        </div>
        {waitingForAnswers ? (
          <Badge tone="amber">待补全</Badge>
        ) : hasContent ? (
          <Badge tone="green">
            <Check className="mr-1 h-3 w-3" />
            可发送
          </Badge>
        ) : (
          <Badge tone="stone">待生成</Badge>
        )}
      </div>

      <div className="relative flex-1 p-4 sm:p-5">
        {notes.length > 0 ? (
          <div className="mb-3 space-y-1.5">
            {notes.map((note, index) => (
              <div
                key={`${note}-${index}`}
                className="rounded-2xl bg-butter-soft px-3 py-2 text-xs leading-relaxed text-[#7a5c2a] ring-2 ring-butter/50"
              >
                {note}
              </div>
            ))}
          </div>
        ) : null}

        {waitingForAnswers ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand/40 bg-brand-soft/40 p-6 text-center">
            <UsagiMascot className="mascot-float h-28 w-28" mood="sad" />
            <p className="mt-2 text-sm font-extrabold text-ink">
              先回答上面的追问
            </p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-ink-soft">
              回答完或跳过后，再生成复盘正文；追问阶段不会显示半成品。
            </p>
          </div>
        ) : (
          <>
            <pre
              className={cn(
                "review-text select-text rounded-2xl border-l-4 border-brand/40 bg-cream/40 p-4 text-ink",
                !hasContent && "opacity-40",
              )}
            >
              {finalText}
            </pre>

            {!hasContent ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                <div className="rounded-[26px] border-2 border-dashed border-brand/40 bg-paper/95 px-5 py-5 text-center shadow-[0_4px_0_#f0d4dd] backdrop-blur-sm">
                  <ChiikawaMascot className="mx-auto h-16 w-16" />
                  <p className="mt-2 text-sm font-extrabold text-ink">
                    生成后会显示在这里
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">
                    左边写完，点“生成复盘”
                  </p>
                </div>
              </div>
            ) : null}
          </>
        )}

        {loading ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-[26px] bg-paper/85 backdrop-blur-[1px]">
            <Spinner className="h-6 w-6" />
            <p className="text-sm font-bold text-ink">{loadingMessage}</p>
            <div className="flex gap-1.5">
              <span className="loading-dot h-1.5 w-1.5 rounded-full bg-brand" />
              <span className="loading-dot h-1.5 w-1.5 rounded-full bg-brand" />
              <span className="loading-dot h-1.5 w-1.5 rounded-full bg-brand" />
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-line/60 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            disabled={!hasContent || loading || waitingForAnswers}
          >
            <Pencil className="h-4 w-4" />
            编辑内容
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRegenerate}
            disabled={!hasContent || loading || waitingForAnswers}
          >
            <RefreshCw className="h-4 w-4" />
            重新生成
          </Button>
        </div>
        <Button
          size="sm"
          onClick={onCopy}
          disabled={!hasContent || loading || waitingForAnswers}
        >
          <Copy className="h-4 w-4" />
          复制
        </Button>
      </div>
    </section>
  );
}
