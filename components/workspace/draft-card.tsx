"use client";

import { Brain, Check, Copy, FileText, Pencil } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChiikawaMascot } from "@/components/mascots";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { MemoryPromptItem } from "@/lib/types";
import { formatSavedAt } from "@/lib/utils";

/** 没有正文时的干净空状态，可以切换查看示例 */
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
        左侧输入后，在此生成复盘
      </p>
      <Button
        variant="ghost"
        size="sm"
        className="mt-3"
        onClick={() => setShowSample(true)}
      >
        查看示例
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
  /** 空状态里「查看示例」用的渲染结果 */
  sampleText: string;
  /** 返回 false 表示复制失败，按钮不显示「已复制」 */
  onCopy: () => void | boolean | Promise<void | boolean>;
  onEdit: () => void;
  onExtractMemory: () => void;
  /** 演示模式：记忆链接改为登录页 */
  demoMode?: boolean;
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
  onExtractMemory,
  demoMode = false,
}: Props) {
  // 生成期间统一显示等待态，避免先露出旧复盘再被新结果替换
  const displayContent = hasContent && !loading;
  const charCount = finalText.replace(/\s/g, "").length;
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  async function handleCopyClick() {
    const result = await onCopy();
    if (result === false) return;

    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 1800);
  }

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
            {displayContent && memories.length > 0 ? (
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
          {displayContent ? (
            <span className="text-[11px] tabular-nums text-ink-soft">
              共 {charCount} 字
            </span>
          ) : null}
          {displayContent ? (
            <Badge tone="green">
              <Check className="mr-1 h-3 w-3" />
              可发送
            </Badge>
          ) : (
            <Badge tone="stone">待生成</Badge>
          )}
        </div>
      </header>

      {displayContent && notes.length > 0 ? (
        <div className="mb-2 space-y-1.5 px-1">
          {notes.map((note, index) => (
            <div
              key={`${note}-${index}`}
              className="rounded-lg bg-butter-soft px-3 py-2 text-xs leading-relaxed text-warning-deep ring-1 ring-butter/50"
            >
              {note}
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-1 flex-col">
        {loading ? (
          <div className="paper-sheet flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <Spinner className="h-5 w-5" />
            <p className="text-sm font-medium text-ink">{loadingMessage}</p>
          </div>
        ) : displayContent ? (
          <div className="paper-sheet flex-1 p-4 sm:p-5">
            <pre className="review-text text-ink">{finalText}</pre>
          </div>
        ) : (
          <EmptyPreview sampleText={sampleText} />
        )}
      </div>

      {displayContent ? (
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

          <Button
            size="sm"
            onClick={() => {
              void handleCopyClick();
            }}
            disabled={loading}
            title={copied ? "已复制到剪贴板" : "复制成品，粘贴到钉钉"}
          >
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copied ? "已复制" : "复制"}
          </Button>
        </footer>
      ) : null}
    </section>
  );
}
