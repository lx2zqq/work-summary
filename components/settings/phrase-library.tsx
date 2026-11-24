"use client";

import { BookOpen, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { MAX_CUSTOM_PHRASES, type CustomPhrase, type PhraseTheme } from "@/lib/types";
import { cn } from "@/lib/utils";

const THEME_LABEL: Record<PhraseTheme, string> = {
  general: "通用",
  exam: "考试",
  meeting: "会议",
  mistake: "错题",
};

type Preview = {
  phrase: string;
  theme: PhraseTheme;
};

export function PhraseLibrary({
  initialPhrases,
  demoMode = false,
  onPhrasesChange,
}: {
  initialPhrases: CustomPhrase[];
  demoMode?: boolean;
  /** 添加或删除后通知父组件，让模板预览同步刷新 */
  onPhrasesChange?: (phrases: CustomPhrase[]) => void;
}) {
  const [phrases, setPhrases] = useState(initialPhrases);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [polishing, setPolishing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const full = phrases.length >= MAX_CUSTOM_PHRASES;

  async function handlePolish() {
    if (!text.trim() || polishing) return;

    setPolishing(true);
    setPreview(null);

    try {
      const response = await fetch("/api/phrases/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        phrase?: string;
        theme?: PhraseTheme;
      };

      if (!response.ok || !data.phrase || !data.theme) {
        throw new Error(data.error || "润色失败，换个说法再试");
      }

      setPreview({ phrase: data.phrase, theme: data.theme });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "润色失败");
    } finally {
      setPolishing(false);
    }
  }

  async function handleAdd() {
    if (!preview || adding) return;

    setAdding(true);

    try {
      const response = await fetch("/api/phrases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preview),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        phrases?: CustomPhrase[];
      };

      if (!response.ok || !data.phrases) {
        throw new Error(data.error || "保存失败");
      }

      setPhrases(data.phrases);
      onPhrasesChange?.(data.phrases);
      setPreview(null);
      setText("");
      toast.success("已添加到话术库");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);

    try {
      const response = await fetch(`/api/phrases/${id}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        phrases?: CustomPhrase[];
      };

      if (!response.ok || !data.phrases) {
        throw new Error(data.error || "删除失败");
      }

      setPhrases(data.phrases);
      onPhrasesChange?.(data.phrases);
      toast.success("已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="paper-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-butter-soft text-warning-deep">
            <BookOpen className="h-4 w-4" />
          </div>
          <h2 className="text-sm font-semibold text-ink">通用话术库</h2>
        </div>
        <Badge tone={full ? "amber" : "stone"}>
          {phrases.length} / {MAX_CUSTOM_PHRASES}
        </Badge>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-ink-soft">
        把你觉得好的话术贴进来，系统会润色成 45~65 字，并检查是否和现有话术重复。
      </p>

      {demoMode ? (
        <p className="mt-3 rounded-lg bg-cream-deep/60 px-3.5 py-2.5 text-xs text-ink-soft">
          演示模式不支持添加话术，登录后可以使用。
        </p>
      ) : (
        <>
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="比如：每天把该跟进的事列清楚，按优先级推进，做到事事有回音。"
            className="mt-3 min-h-[90px] bg-paper text-sm"
            maxLength={300}
            disabled={polishing}
          />

          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-ink-soft">
              {text.length} / 300
            </span>
            <Button
              size="sm"
              onClick={() => {
                void handlePolish();
              }}
              loading={polishing}
              disabled={!text.trim() || full}
            >
              润色并预览
            </Button>
          </div>

          {full ? (
            <p className="mt-2 text-[11px] text-danger">
              已经存满 {MAX_CUSTOM_PHRASES} 条，先删掉几条再加。
            </p>
          ) : null}

          {preview ? (
            <div className="mt-3 rounded-xl bg-cream-deep/60 p-3.5">
              <p className="text-sm leading-relaxed text-ink">
                {preview.phrase}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Badge tone="blue">{THEME_LABEL[preview.theme]}</Badge>
                  <span className="text-[11px] text-ink-soft">
                    {preview.phrase.length} 字
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={polishing}
                    onClick={() => {
                      void handlePolish();
                    }}
                  >
                    重新润色
                  </Button>
                  <Button
                    size="sm"
                    loading={adding}
                    onClick={() => {
                      void handleAdd();
                    }}
                  >
                    添加到话术库
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <ul className="mt-3 space-y-2">
            {phrases.length === 0 ? (
              <li className="rounded-lg bg-cream-deep/40 px-3.5 py-2.5 text-xs text-ink-soft">
                还没有添加过自定义话术。
              </li>
            ) : (
              phrases.map((phrase) => (
                <li
                  key={phrase.id}
                  className="flex items-start justify-between gap-3 rounded-lg bg-cream-deep/40 px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-xs leading-relaxed text-ink">
                      {phrase.content}
                    </p>
                    <span className="mt-1 inline-block text-[10px] text-ink-soft">
                      {THEME_LABEL[phrase.theme]} · {phrase.content.length} 字
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label="删除这条话术"
                    disabled={deletingId === phrase.id}
                    onClick={() => {
                      void handleDelete(phrase.id);
                    }}
                    className={cn(
                      "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-paper hover:text-danger",
                      deletingId === phrase.id && "opacity-50",
                    )}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))
            )}
          </ul>
        </>
      )}
    </section>
  );
}
