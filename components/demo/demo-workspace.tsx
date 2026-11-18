"use client";

import { Copy, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useDemo } from "@/components/demo/demo-provider";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { DraftCard } from "@/components/workspace/draft-card";
import { DraftEditor } from "@/components/workspace/draft-editor";
import { QuestionsCard } from "@/components/workspace/questions-card";
import { RawInputCard } from "@/components/workspace/raw-input-card";
import { copyText } from "@/lib/clipboard";
import {
  DEMO_DRAFT_CONCISE,
  DEMO_DRAFT_DETAILED,
  DEMO_QUESTIONS,
  DEMO_THINKING_MS,
} from "@/lib/demo-data";
import { renderReview } from "@/lib/template";
import {
  MAX_FOLLOW_UP_ROUNDS,
  emptyDraft,
  hasDraftContent,
  type MemoryPromptItem,
  type ReviewDraft,
  type ReviewStyle,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type Tab = "input" | "preview";

function cloneDraft(source: ReviewDraft): ReviewDraft {
  return JSON.parse(JSON.stringify(source)) as ReviewDraft;
}

/**
 * 游客演示：完整走一遍「流水账 → 追问 → 复盘」，
 * 所有内容来自 lib/demo-data，不发起任何请求。
 */
export function DemoWorkspace() {
  const {
    today,
    students,
    memories,
    settings,
    workspace,
    setWorkspace,
    addDemoReview,
  } = useDemo();

  const { rawInput, draft, stage, style } = workspace;

  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("input");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const runStep = useCallback((message: string, next: () => void) => {
    setLoading(true);
    setLoadingMessage(message);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setLoading(false);
      next();
    }, DEMO_THINKING_MS);
  }, []);

  const presetDraft = useCallback(
    (next: ReviewStyle) =>
      cloneDraft(
        next === "concise" ? DEMO_DRAFT_CONCISE : DEMO_DRAFT_DETAILED,
      ),
    [],
  );

  function handleGenerate() {
    if (loading) return;
    runStep("正在检查有没有漏掉的信息…", () => {
      setWorkspace({
        draft: { ...emptyDraft(), questions: DEMO_QUESTIONS },
        stage: "questions",
      });
      setActiveTab("input");
    });
  }

  function handleFinishQuestions() {
    runStep("正在整理复盘…", () => {
      const next = presetDraft(style);
      setWorkspace({ draft: next, stage: "draft" });
      setActiveTab("preview");
      addDemoReview({
        date: today,
        style,
        finalText: renderReview(next, today, settings),
      });
    });
  }

  function handleStyleChange(next: ReviewStyle) {
    if (stage === "draft") {
      setWorkspace({ style: next, draft: presetDraft(next) });
      return;
    }
    setWorkspace({ style: next });
  }

  const finalText =
    stage === "draft" && hasDraftContent(draft)
      ? renderReview(draft, today, settings)
      : "";

  // 演示里的记忆是完整的 Memory，展示组件只要精简字段
  const promptMemories: MemoryPromptItem[] = memories.map((memory) => ({
    id: memory.id,
    scope: memory.scope,
    studentName: memory.studentName,
    category: memory.category,
    content: memory.content,
    importance: memory.importance,
  }));

  async function handleCopy() {
    const ok = await copyText(finalText);

    if (ok) toast.success("已复制，可以粘贴到钉钉");
    else toast.error("复制失败，请手动选择文本");
  }

  const hasContent = hasDraftContent(draft);
  const questioning = stage === "questions";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm leading-relaxed text-ink-soft">
          试试把流水账改成你自己的版本，再点生成。
        </p>
        <Segmented
          options={[
            { value: "concise", label: "简洁版" },
            { value: "detailed", label: "详细版" },
          ]}
          value={style}
          onChange={handleStyleChange}
          ariaLabel="文风"
        />
      </div>

      {draft.questions.length > 0 && !loading ? (
        <QuestionsCard
          questions={draft.questions}
          round={0}
          maxRounds={MAX_FOLLOW_UP_ROUNDS}
          loading={loading}
          memories={promptMemories}
          onSubmit={handleFinishQuestions}
          onSkip={handleFinishQuestions}
          demoMode
        />
      ) : null}

      <div className="md:hidden">
        <Segmented
          options={[
            { value: "input", label: "输入" },
            { value: "preview", label: "预览" },
          ]}
          value={activeTab}
          onChange={setActiveTab}
          className="w-full [&>button]:flex-1"
          ariaLabel="输入或预览"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-12 md:items-start">
        <div
          className={cn(
            "md:col-span-5",
            activeTab !== "input" && "hidden md:block",
          )}
        >
          <RawInputCard
            value={rawInput}
            students={students}
            hasDraft={hasContent}
            questioning={questioning}
            loading={loading}
            onChange={(value) => setWorkspace({ rawInput: value })}
            onGenerate={handleGenerate}
            demoMode
          />
        </div>

        <div
          className={cn(
            "md:col-span-7",
            activeTab !== "preview" && "hidden md:block",
          )}
        >
          <DraftCard
            finalText={finalText}
            hasContent={hasContent}
            waitingForAnswers={questioning}
            loading={loading}
            loadingMessage={loadingMessage}
            notes={draft.notes}
            memories={stage === "idle" ? [] : promptMemories}
            memoryEnabled={settings.enableMemory}
            memoryExtractedAt={null}
            memoryStale={false}
            extractingMemory={false}
            onCopy={() => {
              void handleCopy();
            }}
            onEdit={() => setEditorOpen(true)}
            onRegenerate={handleGenerate}
            onExtractMemory={() => {
              toast.info("演示模式不会调用模型，登录后可以体验完整功能");
            }}
            demoMode
          />
        </div>
      </div>

      <DraftEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        draft={draft}
        settings={settings}
        onSave={(next) => {
          setWorkspace({ draft: next, stage: "draft" });
        }}
      />

      <div className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-line/70 bg-cream/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md md:hidden">
        {activeTab === "input" ? (
          <Button
            className="w-full"
            size="lg"
            loading={loading}
            onClick={handleGenerate}
          >
            {!loading ? <Sparkles className="h-4 w-4" /> : null}
            {hasContent ? "重新生成" : "生成复盘"}
          </Button>
        ) : (
          <Button
            className="w-full"
            size="lg"
            onClick={() => {
              void handleCopy();
            }}
            disabled={!finalText || loading}
          >
            <Copy className="h-4 w-4" />
            复制到钉钉
          </Button>
        )}
      </div>
    </div>
  );
}
