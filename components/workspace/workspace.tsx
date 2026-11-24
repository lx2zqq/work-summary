"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Segmented } from "@/components/ui/segmented";
import {
  answersFromConversation,
  type QuestionAnswer,
} from "@/lib/answers";
import { trackClientEvent } from "@/lib/analytics/client";
import { copyText } from "@/lib/clipboard";
import { isValidISODate, relativeDateLabel, todayISO } from "@/lib/date";
import { normalizeDraft } from "@/lib/draft";
import { getGenerationJob } from "@/lib/generation-store";
import {
  isMemoryExtractionStale,
  resolveMemoryCopyAction,
} from "@/lib/memory";
import { SAMPLE_DRAFT } from "@/lib/sample";
import { setSelectedDate } from "@/lib/selected-date";
import { renderReview } from "@/lib/template";
import {
  MAX_FOLLOW_UP_ROUNDS,
  emptyDraft,
  hasDraftContent,
  type AppSettings,
  type MemoryPromptItem,
  type QAPair,
  type ReviewDraft,
  type ReviewRecord,
  type ReviewStyle,
  type Student,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { DraftCard } from "./draft-card";
import { DraftEditor } from "./draft-editor";
import { QuestionsCard } from "./questions-card";
import { RawInputCard } from "./raw-input-card";
import { RecoveryBanner } from "./recovery-banner";
import { useReviewGeneration } from "./use-review-generation";
import { useWorkspaceAutosave } from "./use-workspace-autosave";
import type { SaveStatus } from "./workspace-date";
import {
  QUESTION_LOADING_MESSAGES,
  type LoadingKind,
} from "./workspace-shared";

type Props = {
  initialDate: string;
  initialReview: ReviewRecord | null;
  initialStudents: Student[];
  initialSettings: AppSettings;
};

export function Workspace({
  initialDate,
  initialReview,
  initialStudents,
  initialSettings,
}: Props) {
  const router = useRouter();
  const initialJob = getGenerationJob();
  const jobForDate =
    initialJob && initialJob.date === initialDate ? initialJob : null;
  const jobWaiting =
    jobForDate?.status === "loading" || jobForDate?.status === "saving";

  const [date, setDate] = useState(initialDate);
  const [rawInput, setRawInput] = useState(
    jobForDate?.rawInput ?? initialReview?.rawInput ?? "",
  );
  const [style, setStyle] = useState<ReviewStyle>(
    jobForDate?.style ?? initialReview?.style ?? initialSettings.defaultStyle,
  );
  const [draft, setDraft] = useState<ReviewDraft>(() => {
    if (jobForDate?.result && jobForDate.status !== "error") {
      return normalizeDraft(jobForDate.result.draft);
    }
    return initialReview ? normalizeDraft(initialReview.draft) : emptyDraft();
  });
  const [conversation, setConversation] = useState<QAPair[]>(
    jobForDate?.conversationAfter ?? initialReview?.conversation ?? [],
  );
  const [round, setRound] = useState(
    jobForDate?.round ?? initialReview?.round ?? 0,
  );
  const [loadingKind, setLoadingKind] = useState<LoadingKind>(() => {
    if (jobWaiting) {
      return jobForDate?.mode === "questions" ? "questions" : "final";
    }
    return null;
  });
  const [loadingMessage, setLoadingMessage] = useState(
    jobForDate?.mode === "questions"
      ? QUESTION_LOADING_MESSAGES[0]
      : jobForDate
        ? "正在生成复盘正文…"
        : QUESTION_LOADING_MESSAGES[0],
  );
  // 记录上次生成用的流水账，用来判断左侧按钮是否该恢复炭黑
  const [rawBaseline, setRawBaseline] = useState(
    (jobForDate?.rawInput ?? initialReview?.rawInput ?? "").trim(),
  );
  const [memoryExtractedAt, setMemoryExtractedAt] = useState<
    string | null
  >(initialReview?.memoryExtractedAt ?? null);
  const [extractingMemory, setExtractingMemory] = useState(false);
  const [usedMemories, setUsedMemories] = useState<MemoryPromptItem[]>(
    jobForDate?.result?.memories ?? [],
  );
  const [restoredAnswers, setRestoredAnswers] = useState<
    Record<string, QuestionAnswer>
  >(() => {
    if (jobForDate?.status === "error") {
      return answersFromConversation(
        draft.questions,
        jobForDate.conversationAfter,
      );
    }

    return {};
  });
  const extractingMemoryRef = useRef(false);
  const dateRef = useRef(date);
  const mountedRef = useRef(false);
  const pageUnloadingRef = useRef(false);
  const activeJobIdRef = useRef<string | null>(null);
  const [activeTab, setActiveTab] = useState<"input" | "preview">(
    jobWaiting || jobForDate?.status === "done" ? "preview" : "input",
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [hydratedDate, setHydratedDate] = useState(initialDate);

  useEffect(() => {
    dateRef.current = date;
    setSelectedDate(date);
  }, [date]);

  useEffect(() => {
    mountedRef.current = true;

    const markUnloading = () => {
      pageUnloadingRef.current = true;
    };

    window.addEventListener("pagehide", markUnloading);
    window.addEventListener("beforeunload", markUnloading);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("pagehide", markUnloading);
      window.removeEventListener("beforeunload", markUnloading);
    };
  }, []);

  const loading = loadingKind !== null;
  const questioning = draft.questions.length > 0;
  // 轮次到上限后即使还残留旧问题，也不再把用户带回追问卡
  const showQuestions =
    questioning && !loading && round < MAX_FOLLOW_UP_ROUNDS;
  const hasFinalContent = hasDraftContent(draft);
  // 移动端右侧 Tab 的状态提示：待回答追问显示数量，已有正文显示圆点
  const previewBadge = questioning
    ? draft.questions.length
    : hasFinalContent
      ? ("dot" as const)
      : undefined;

  const finalText = useMemo(
    () => renderReview(draft, date, initialSettings),
    [draft, date, initialSettings],
  );

  const {
    saving,
    saveFailed,
    savedAt,
    dirty,
    archived,
    savedAtRef,
    editRevisionRef,
    markDirty,
    saveNow,
    persistReview,
    setSavedAt,
    setSaveFailed,
    setDirty,
    setArchived,
  } = useWorkspaceAutosave({
    date,
    rawInput,
    draft,
    style,
    conversation,
    round,
    loading,
    hydratedDate,
    initialSavedAt: jobForDate?.savedAt ?? initialReview?.updatedAt ?? null,
    initialSavedAtRef: initialReview?.updatedAt ?? null,
    initialDirty: Boolean(
      jobForDate?.status === "done" && jobForDate.saveFailed,
    ),
    initialSaveFailed: Boolean(
      jobForDate?.status === "done" && jobForDate.saveFailed,
    ),
    initialArchived: Boolean(initialReview?.finalText.trim()),
    activeJobIdRef,
  });

  const applyReviewRecord = useCallback(
    (review: ReviewRecord | null) => {
      setRawInput(review?.rawInput ?? "");
      setDraft(review ? normalizeDraft(review.draft) : emptyDraft());
      setStyle(review?.style ?? initialSettings.defaultStyle);
      setConversation(review?.conversation ?? []);
      setRound(review?.round ?? 0);
      setRawBaseline((review?.rawInput ?? "").trim());
      savedAtRef.current = review?.updatedAt ?? null;
      setSavedAt(review?.updatedAt ?? null);
      setArchived(Boolean(review?.finalText.trim()));
      setMemoryExtractedAt(review?.memoryExtractedAt ?? null);
      setUsedMemories([]);
      setRestoredAnswers({});
      // 让仍挂在旧数据上的保存请求失效，避免误标新状态为已保存
      editRevisionRef.current += 1;
      setDirty(false);
      setSaveFailed(false);
      setActiveTab(
        review && review.draft.questions.length > 0 ? "preview" : "input",
      );
    },
    [
      initialSettings.defaultStyle,
      savedAtRef,
      editRevisionRef,
      setSavedAt,
      setArchived,
      setDirty,
      setSaveFailed,
    ],
  );

  const {
    recoveryJob,
    checkingRecovery,
    runFinal,
    runQuestions,
    handleCheckRecovery,
    handleRetryRecovery,
  } = useReviewGeneration({
    date,
    rawInput,
    draft,
    loadingKind,
    setLoadingKind,
    setLoadingMessage,
    setRawInput,
    setStyle,
    setDraft,
    setConversation,
    setRound,
    setRawBaseline,
    setUsedMemories,
    setRestoredAnswers,
    setActiveTab,
    markDirty,
    persistReview,
    savedAtRef,
    setSavedAt,
    setSaveFailed,
    setDirty,
    setArchived,
    activeJobIdRef,
    mountedRef,
    pageUnloadingRef,
    onLoadReview: applyReviewRecord,
  });

  const extractMemory = useCallback(
    async (
      force: boolean,
      options: { skipSave?: boolean; quiet?: boolean } = {},
    ) => {
      if (
        !initialSettings.enableMemory ||
        extractingMemoryRef.current
      ) {
        return;
      }

      const targetDate = date;
      extractingMemoryRef.current = true;
      setExtractingMemory(true);

      try {
        if (!options.skipSave) {
          const saved = await saveNow({ silent: true });

          if (!saved) {
            toast.error("保存失败，暂时不能提取记忆");
            return;
          }
        }

        const response = await fetch("/api/memories/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: targetDate, force }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          skipped?: boolean;
          count?: number;
          extractedAt?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || "提取记忆失败");
        }

        if (data.skipped) return;

        if (dateRef.current === targetDate) {
          setMemoryExtractedAt(
            data.extractedAt ?? new Date().toISOString(),
          );

          const count = data.count ?? 0;

          if (count > 0) {
            toast.success(
              options.quiet
                ? `已更新 ${count} 条长期记忆`
                : `已提取 ${count} 条长期记忆`,
            );
          } else if (!options.quiet) {
            toast.info("今天没有新的记忆需要提取");
          }
        }
      } catch (error) {
        if (dateRef.current === targetDate) {
          toast.error(
            error instanceof Error ? error.message : "提取记忆失败",
          );
        }
      } finally {
        extractingMemoryRef.current = false;
        setExtractingMemory(false);
      }
    },
    [date, initialSettings.enableMemory, saveNow],
  );

  const memoryStale = useMemo(() => {
    if (!memoryExtractedAt) return false;
    if (dirty) return true;
    if (!savedAt) return false;

    return isMemoryExtractionStale({
      extractedAt: memoryExtractedAt,
      updatedAt: savedAt,
    });
  }, [memoryExtractedAt, dirty, savedAt]);

  // 有成品或追问时左侧按钮默认降级，改过流水账才恢复炭黑
  const generatePrimary =
    (!questioning && !hasFinalContent) || rawInput.trim() !== rawBaseline;

  const hasAnyInput = rawInput.trim().length > 0 || hasFinalContent;

  // 只有有内容时才显示保存状态，空白日期不出现「尚未保存」
  const saveStatus: SaveStatus = !hasAnyInput
    ? "idle"
    : saveFailed
      ? "failed"
      : saving
        ? "saving"
        : dirty
          ? "dirty"
          : archived
            ? "archived"
            : savedAt
              ? "saved"
              : "idle";

  const sampleText = useMemo(
    () => renderReview(SAMPLE_DRAFT, date, initialSettings),
    [date, initialSettings],
  );

  /**
   * 「保存」= 显式归档。
   * 自动暂存仍会写库防丢，但只有这里会把状态标记为已归档。
   */
  const handleArchive = useCallback(async () => {
    if (!hasAnyInput) {
      toast.error("还没有可保存的内容");
      return;
    }

    const revision = editRevisionRef.current;
    const saved = await saveNow({ silent: true });

    if (!saved) {
      toast.error("保存失败，请稍后重试");
      return;
    }

    // 保存期间用户又改了内容，不能再标记为已归档
    if (editRevisionRef.current !== revision) {
      setArchived(false);
      toast.info("内容有更新，已自动暂存；完成后再保存归档");
      return;
    }

    const canArchive =
      hasDraftContent(draft) && draft.questions.length === 0;

    setArchived(canArchive);
    toast.success(
      canArchive ? "已归档到历史" : "已暂存；补齐追问后可以归档",
    );
  }, [hasAnyInput, draft, saveNow, editRevisionRef, setArchived]);

  // 桌面端 Ctrl / ⌘ + S：拦掉浏览器保存网页，转为保存归档
  useEffect(() => {
    function handleSaveShortcut(event: KeyboardEvent) {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== "s"
      ) {
        return;
      }

      event.preventDefault();
      if (loading || editorOpen || !hasAnyInput) return;
      void handleArchive();
    }

    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, [loading, editorOpen, hasAnyInput, handleArchive]);

  const handleGenerate = useCallback(() => {
    // 手动重新生成视为新一轮追问：重置轮次，但保留已输入内容和问答记录
    void runQuestions({
      style,
      answers: conversation,
      round: 0,
      conversationAfter: conversation,
    });
  }, [runQuestions, style, conversation]);

  const handleAnswers = useCallback(
    async (answers: QAPair[]) => {
      const nextConversation = [...conversation, ...answers];
      const nextRound = Math.min(round + 1, MAX_FOLLOW_UP_ROUNDS);

      trackClientEvent("question_answered", date, {
        round,
        questionCount: draft.questions.length,
        answeredCount: answers.length,
        skipped: false,
      });

      if (nextRound >= MAX_FOLLOW_UP_ROUNDS) {
        toast.info(`已问完 ${MAX_FOLLOW_UP_ROUNDS} 轮，正在生成复盘`);
        await runFinal({
          style,
          answers: nextConversation,
          round: nextRound,
          conversationAfter: nextConversation,
        });
        return;
      }

      await runQuestions({
        style,
        answers: nextConversation,
        round: nextRound,
        conversationAfter: nextConversation,
      });
    },
    [conversation, round, style, draft, date, runQuestions, runFinal],
  );

  const handleSkipQuestions = useCallback(() => {
    if (loading) return;

    const nextRound = Math.min(round + 1, MAX_FOLLOW_UP_ROUNDS);

    trackClientEvent("question_answered", date, {
      round,
      questionCount: draft.questions.length,
      answeredCount: 0,
      skipped: true,
    });

    void runFinal({
      style,
      answers: conversation,
      round: nextRound,
      conversationAfter: conversation,
    });
  }, [loading, round, style, draft, date, conversation, runFinal]);

  const handleStyleChange = useCallback(
    (nextStyle: ReviewStyle) => {
      if (nextStyle === style || loading) return;

      if (questioning || !hasDraftContent(draft) || !rawInput.trim()) {
        setStyle(nextStyle);
        markDirty();
        return;
      }

      void runFinal({
        style: nextStyle,
        answers: conversation,
        round,
        conversationAfter: conversation,
        restyle: true,
      });
    },
    [
      style,
      loading,
      questioning,
      draft,
      rawInput,
      conversation,
      round,
      runFinal,
      markDirty,
    ],
  );

  const handleDateChange = useCallback(
    async (nextDate: string) => {
      if (!isValidISODate(nextDate) || nextDate === date || loading) {
        return;
      }

      const previousDate = date;
      const hasSomething =
        rawInput.trim().length > 0 || hasDraftContent(draft);

      // 先锁住编辑和生成，等保存及新日期加载完成再解锁
      setLoadingKind("date");
      setLoadingMessage("正在切换日期…");

      if (dirty && hasSomething) {
        const saved = await saveNow({ silent: true });
        if (!saved) {
          setLoadingKind(null);
          toast.error("当前内容保存失败，先不切换日期");
          return;
        }
      }

      setHydratedDate("");
      setDate(nextDate);

      try {
        const response = await fetch(`/api/reviews?date=${nextDate}`);
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          review?: ReviewRecord | null;
        };

        if (!response.ok) {
          throw new Error(data.error || "加载失败");
        }

        const review = data.review ?? null;

        applyReviewRecord(review);
        setHydratedDate(nextDate);
        router.replace(
          nextDate === todayISO() ? "/" : `/?date=${nextDate}`,
          { scroll: false },
        );

        toast.success(
          review
            ? `已加载 ${relativeDateLabel(nextDate)} 的复盘`
            : `开始写 ${relativeDateLabel(nextDate)} 的复盘`,
        );
      } catch (error) {
        setDate(previousDate);
        setHydratedDate(previousDate);
        toast.error(
          error instanceof Error ? error.message : "加载失败",
        );
      } finally {
        setLoadingKind(null);
      }
    },
    [
      date,
      loading,
      dirty,
      rawInput,
      draft,
      saveNow,
      applyReviewRecord,
      router,
    ],
  );

  const handleCopy = useCallback(async () => {
    if (questioning) {
      toast.error("还有追问没回答，先回答或点“跳过追问并生成”");
      return false;
    }

    if (!hasDraftContent(draft)) {
      toast.error("还没有可复制的内容");
      return false;
    }

    const okay = await copyText(finalText);
    if (!okay) {
      toast.error("复制失败，请手动选中文字复制");
      return false;
    }

    trackClientEvent("review_copied", date, {
      charCount: finalText.length,
      itemCount: Object.values(draft.sections).reduce(
        (total, items) => total + items.length,
        0,
      ),
    });

    // 复制只做纯文本；记忆提取改成显式操作，不再静默调模型
    const memoryAction = resolveMemoryCopyAction({
      enabled: initialSettings.enableMemory,
      extractedAt: memoryExtractedAt,
      stale: memoryStale,
    });

    if (memoryAction === "none") {
      toast.success("已复制，去钉钉粘贴吧");
      return true;
    }

    toast.success("已复制，去钉钉粘贴吧", {
      description:
        memoryAction === "first"
          ? "顺便提取今天的长期记忆？"
          : "正文有更新，要同步长期记忆吗？",
      duration: 8000,
      action: {
        label: memoryAction === "first" ? "提取记忆" : "更新记忆",
        onClick: () => {
          void (async () => {
            const saved = await saveNow({ silent: true });

            if (!saved) {
              toast.error("复盘保存失败，记忆还没提取");
              return;
            }

            await extractMemory(false, { skipSave: true });
          })();
        },
      },
    });

    return true;
  }, [
    questioning,
    draft,
    finalText,
    date,
    initialSettings.enableMemory,
    memoryExtractedAt,
    memoryStale,
    saveNow,
    extractMemory,
  ]);

  const handleEditorSave = useCallback(
    (nextDraft: ReviewDraft) => {
      setDraft(nextDraft);
      markDirty();
      toast.success("内容已更新");

      void persistReview(
        {
          date,
          rawInput,
          draft: nextDraft,
          style,
          conversation,
          round,
        },
        { silent: true },
      );
    },
    [date, rawInput, style, conversation, round, persistReview, markDirty],
  );

  return (
    <div className="space-y-4">
      {recoveryJob ? (
        <RecoveryBanner
          checking={checkingRecovery}
          loading={loading}
          onCheck={() => {
            void handleCheckRecovery();
          }}
          onRetry={handleRetryRecovery}
        />
      ) : null}

      <div className="lg:hidden">
        <Segmented
          options={
            questioning
              ? [
                  { value: "input" as const, label: "流水账" },
                  {
                    value: "preview" as const,
                    label: "追问",
                    badge: previewBadge,
                  },
                ]
              : [
                  { value: "input" as const, label: "输入" },
                  {
                    value: "preview" as const,
                    label: "预览",
                    badge: previewBadge,
                  },
                ]
          }
          value={activeTab}
          onChange={setActiveTab}
          className="w-full [&>button]:flex-1"
          ariaLabel="输入或预览"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div
          className={cn(
            "space-y-4",
            activeTab !== "input" && "hidden lg:block",
          )}
        >
          <RawInputCard
            key={date}
            value={rawInput}
            students={initialStudents}
            hasDraft={hasFinalContent}
            questioning={questioning}
            loading={loading}
            style={style}
            date={date}
            today={todayISO()}
            saveStatus={saveStatus}
            switchingDate={loadingKind === "date"}
            canSave={hasAnyInput}
            primaryAction={generatePrimary}
            onChange={(value) => {
              setRawInput(value);
              markDirty();
            }}
            onStyleChange={handleStyleChange}
            onGenerate={handleGenerate}
            onDateChange={(nextDate) => {
              void handleDateChange(nextDate);
            }}
            onSave={() => {
              void handleArchive();
            }}
          />
        </div>

        <div
          className={cn(
            "lg:sticky lg:top-20",
            activeTab !== "preview" && "hidden lg:block",
          )}
        >
          <div
            key={
              showQuestions
                ? "questions"
                : loading
                  ? "draft-loading"
                  : "draft"
            }
            className="panel-swap"
          >
            {showQuestions ? (
              <QuestionsCard
                key={`${date}-${round}-${draft.questions
                  .map((question) => `${question.id}:${question.text}`)
                  .join("|")}`}
                questions={draft.questions}
                round={round}
                maxRounds={MAX_FOLLOW_UP_ROUNDS}
                loading={loading}
                memories={usedMemories}
                initialAnswers={restoredAnswers}
                onSubmit={(answers) => {
                  void handleAnswers(answers);
                }}
                onSkip={handleSkipQuestions}
              />
            ) : (
              <DraftCard
                finalText={finalText}
                hasContent={hasFinalContent}
                loading={loading}
                loadingMessage={loadingMessage}
                notes={draft.notes}
                memories={usedMemories}
                memoryEnabled={initialSettings.enableMemory}
                memoryExtractedAt={memoryExtractedAt}
                memoryStale={memoryStale}
                extractingMemory={extractingMemory}
                sampleText={sampleText}
                onCopy={handleCopy}
                onEdit={() => setEditorOpen(true)}
                onExtractMemory={() => {
                  void extractMemory(true);
                }}
              />
            )}
          </div>
        </div>
      </div>

      <DraftEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        draft={draft}
        settings={initialSettings}
        onSave={handleEditorSave}
      />
    </div>
  );
}
