"use client";

import {
  Brain,
  Check,
  Copy,
  FileText,
  Pencil,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ChiikawaMascot } from "@/components/mascots";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type {
  PartialText,
  SectionStreamEntry,
} from "@/lib/ai/stream-parser";
import { numberPrefix } from "@/lib/template";
import { SECTION_META, type MemoryPromptItem } from "@/lib/types";
import { formatSavedAt } from "@/lib/utils";

/** 流式生成时的实时预览：完整条目 + 正在写的那一句 */
function StreamingPreview({
  sections,
  partial,
}: {
  sections: SectionStreamEntry[];
  partial: PartialText | null;
}) {
  const merged = sections.map((entry) => ({
    key: entry.key,
    items: [...entry.items],
  }));

  if (partial) {
    const index = merged.findIndex((entry) => entry.key === partial.key);

    if (index >= 0) merged[index].items.push(partial.text);
    else merged.push({ key: partial.key, items: [partial.text] });
  }

  return (
    <div data-streaming="true" className="space-y-3.5">
      {merged.map(({ key, items }) => (
        <section key={key}>
          <p className="text-sm font-medium text-ink">
            🍊【{SECTION_META[key].title}】
          </p>
          <ul className="mt-1 space-y-0.5">
            {items.map((item, index) => {
              const typing = Boolean(
                partial &&
                  partial.key === key &&
                  index === items.length - 1 &&
                  item === partial.text,
              );

              return (
                <li
                  key={`${key}-${index}`}
                  className="review-text text-sm leading-relaxed text-ink"
                >
                  {numberPrefix(index)}
                  {item}
                  {typing ? (
                    <span
                      aria-hidden
                      className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse rounded-full bg-brand align-middle"
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <div className="flex items-center gap-2 pt-1 text-xs font-medium text-ink-soft">
        <Spinner className="h-3.5 w-3.5" />
        正在生成…
      </div>
    </div>
  );
}

/** 没有正文时的干净空状态，可以切换查看模板示例 */
function EmptyPreview({ sampleText }: { sampleText: string }) {
  const [showSample, setShowSample] = useState(false);

  if (showSample) {
    return (
      <div className="paper-sheet flex flex-1 flex-col p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-medium text-ink-soft">
            模板示例
          </span>
          <button
            type="button"
            onClick={() => setShowSample(false)}
            className="text-[11px] font-medium text-brand-deep underline-offset-2 hover:underline"
          >
            收起
          </button>
        </div>
        <pre className="review-text text-ink">{sampleText}</pre>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <ChiikawaMascot className="h-16 w-16" />
      <p className="mt-3 text-sm font-medium text-ink">
        写点什么，成品会出现在这里
      </p>
      <p className="mt-1 max-w-[260px] text-xs leading-relaxed text-ink-soft">
        流水账也可以，生成前会先确认关键信息。
      </p>
      <Button
        variant="ghost"
        size="sm"
        className="mt-3"
        onClick={() => setShowSample(true)}
      >
        查看模板示例
      </Button>
    </div>
  );
}

type Props = {
  finalText: string;
  hasContent: boolean;
  loading: boolean;
  loadingMessage: string;
  notes: string[];
  memories: MemoryPromptItem[];
  memoryEnabled: boolean;
  memoryExtractedAt: string | null;
  memoryStale: boolean;
  extractingMemory: boolean;
  /** 空状态里「查看模板示例」用的渲染结果 */
  sampleText: string;
  onCopy: () => void;
  onEdit: () => void;
  onRegenerate: () => void;
  onExtractMemory: () => void;
  /** 演示模式：记忆链接改为登录页 */
  demoMode?: boolean;
  /** 流式生成中已经收到的完整条目 */
  streaming?: SectionStreamEntry[];
  /** 正在逐字生成的那一句 */
  streamingPartial?: PartialText | null;
};

export function DraftCard({
  finalText,
  hasContent,
  loading,
  loadingMessage,
  notes,
  memories,
  memoryEnabled,
  memoryExtractedAt,
  memoryStale,
  extractingMemory,
  sampleText,
  onCopy,
  onEdit,
  onRegenerate,
  onExtractMemory,
  demoMode = false,
  streaming = [],
  streamingPartial = null,
}: Props) {
  const showStreaming =
    loading && (streaming.length > 0 || Boolean(streamingPartial));

  const memoryTitle = memoryExtractedAt
    ? memoryStale
      ? "正文有更新，建议重新提取"
      : `上次提取：${formatSavedAt(memoryExtractedAt)}`
    : "从今天正文提取长期记忆";

  return (
    <section className="flex flex-col rounded-2xl border border-line/70 bg-canvas p-3 sm:p-4 lg:min-h-[640px]">
      <header className="flex items-start justify-between gap-2 px-1 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-paper text-brand-deep ring-1 ring-line/60">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink">复盘预览</h2>
            {memories.length > 0 ? (
              <p className="mt-0.5 flex items-center gap-1 text-[10px] text-ink-soft">
                <Brain className="h-3 w-3" />
                记忆 {memories.length} 条
                <Link
                  href={demoMode ? "/login" : "/memories"}
                  className="underline"
                >
                  查看
                </Link>
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {loading ? <Spinner className="h-3.5 w-3.5" /> : null}
          {hasContent ? (
            <Badge tone="green">
              <Check className="mr-1 h-3 w-3" />
              可发送
            </Badge>
          ) : (
            <Badge tone="stone">待生成</Badge>
          )}
        </div>
      </header>

      {notes.length > 0 ? (
        <div className="mb-2 space-y-1.5 px-1">
          {notes.map((note, index) => (
            <div
              key={`${note}-${index}`}
              className="rounded-lg bg-butter-soft px-3 py-2 text-xs leading-relaxed text-[#7a5c2a] ring-1 ring-butter/50"
            >
              {note}
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-1 flex-col">
        {showStreaming ? (
          <div className="paper-sheet flex-1 p-4 sm:p-5">
            <StreamingPreview
              sections={streaming}
              partial={streamingPartial}
            />
          </div>
        ) : hasContent ? (
          <div className="paper-sheet flex-1 p-4 sm:p-5">
            <pre className="review-text text-ink">{finalText}</pre>
          </div>
        ) : loading ? (
          <div className="paper-sheet flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <Spinner className="h-5 w-5" />
            <p className="text-sm font-medium text-ink">{loadingMessage}</p>
          </div>
        ) : (
          <EmptyPreview sampleText={sampleText} />
        )}
      </div>

      {hasContent ? (
        <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 px-1 pt-3">
          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onEdit}
              disabled={loading}
            >
              <Pencil className="h-4 w-4" />
              编辑内容
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRegenerate}
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4" />
              重新生成
            </Button>
            {memoryEnabled ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onExtractMemory}
                loading={extractingMemory}
                disabled={loading}
                title={memoryTitle}
              >
                <Brain className="h-4 w-4" />
                提取记忆
              </Button>
            ) : null}
          </div>

          <Button size="sm" onClick={onCopy} disabled={loading}>
            <Copy className="h-4 w-4" />
            复制
          </Button>
        </footer>
      ) : null}
    </section>
  );
}
