"use client";

import { Copy, Sparkles } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { copyText } from "@/lib/clipboard";
import { isValidISODate, relativeDateLabel } from "@/lib/date";
import { mergeFollowUpDraft, normalizeDraft } from "@/lib/draft";
import {
  isMemoryExtractionStale,
  resolveMemoryCopyAction,
} from "@/lib/memory";
import { renderReview } from "@/lib/template";
import {
  MAX_FOLLOW_UP_ROUNDS,
  MAX_QUESTIONS_PER_ROUND,
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
import { DateBar } from "./date-bar";
import { DraftCard } from "./draft-card";
import { DraftEditor } from "./draft-editor";
import { QuestionsCard } from "./questions-card";
import { RawInputCard } from "./raw-input-card";

type Props = {
  initialDate: string;
  initialReview: ReviewRecord | null;
  initialStudents: Student[];
  initialSettings: AppSettings;
};

type LoadingKind = "questions" | "final" | "date" | null;

type SavePayload = {
  date: string;
  rawInput: string;
  draft: ReviewDraft;
  style: ReviewStyle;
  conversation: QAPair[];
  round: number;
};

type GenerateConfig = {
  style: ReviewStyle;
  answers: QAPair[];
  round: number;
  conversationAfter: QAPair[];
  restyle?: boolean;
};

type CallConfig = {
  mode: "questions" | "final" | "restyle";
  style: ReviewStyle;
  answers: QAPair[];
  round: number;
};

type CallResult = {
  draft: ReviewDraft;
  fallback: boolean;
  warning?: string;
  memories: MemoryPromptItem[];
};

const QUESTION_LOADING_MESSAGES = [
  "正在检查有没有漏掉的信息…",
  "正在核对五个核心栏目…",
  "正在整理需要确认的问题…",
];

export function Workspace({
  initialDate,
  initialReview,
  initialStudents,
  initialSettings,
}: Props) {
  const [date, setDate] = useState(initialDate);
  const [rawInput, setRawInput] = useState(initialReview?.rawInput ?? "");
  const [style, setStyle] = useState<ReviewStyle>(
    initialReview?.style ?? initialSettings.defaultStyle,
  );
  const [draft, setDraft] = useState<ReviewDraft>(() =>
    initialReview ? normalizeDraft(initialReview.draft) : emptyDraft(),
  );
  const [conversation, setConversation] = useState<QAPair[]>(
    initialReview?.conversation ?? [],
  );
  const [round, setRound] = useState(initialReview?.round ?? 0);
  const [loadingKind, setLoadingKind] = useState<LoadingKind>(null);
  const [loadingMessage, setLoadingMessage] = useState(
    QUESTION_LOADING_MESSAGES[0],
  );
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(
    initialReview?.updatedAt ?? null,
  );
  const [dirty, setDirty] = useState(false);
  const [memoryExtractedAt, setMemoryExtractedAt] = useState<
    string | null
  >(initialReview?.memoryExtractedAt ?? null);
  const [extractingMemory, setExtractingMemory] = useState(false);
  const [usedMemories, setUsedMemories] = useState<MemoryPromptItem[]>(
    [],
  );
  const extractingMemoryRef = useRef(false);
  const dateRef = useRef(date);
  const [activeTab, setActiveTab] = useState<"input" | "preview">("input");
  const [editorOpen, setEditorOpen] = useState(false);
  const [hydratedDate, setHydratedDate] = useState(initialDate);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const savingCountRef = useRef(0);
  const editRevisionRef = useRef(0);

  useEffect(() => {
    dateRef.current = date;
  }, [date]);

  const loading = loadingKind !== null;
  const questioning = draft.questions.length > 0;
  const hasFinalContent = hasDraftContent(draft);

  const finalText = useMemo(
    () => renderReview(draft, date, initialSettings),
    [draft, date, initialSettings],
  );

  useEffect(() => {
    if (loadingKind !== "questions") return;

    let index = 0;

    const timer = setInterval(() => {
      index = (index + 1) % QUESTION_LOADING_MESSAGES.length;
      setLoadingMessage(QUESTION_LOADING_MESSAGES[index]);
    }, 2400);

    return () => clearInterval(timer);
  }, [loadingKind]);

  const markDirty = useCallback(() => {
    editRevisionRef.current += 1;
    setDirty(true);
  }, []);

  const persistReviewNow = useCallback(
    async (
      payload: SavePayload,
      options: { silent?: boolean },
      revision: number,
    ): Promise<boolean> => {
      if (!payload.rawInput.trim() && !hasDraftContent(payload.draft)) {
        return false;
      }

      const isLatest = () => editRevisionRef.current === revision;

      savingCountRef.current += 1;
      setSaving(true);
      if (isLatest()) setSaveFailed(false);

      try {
        const response = await fetch("/api/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          review?: { updatedAt?: string };
        };

        if (!response.ok) {
          throw new Error(data.error || "保存失败");
        }

        setSavedAt(data.review?.updatedAt ?? new Date().toISOString());

        // 请求期间用户可能又改了内容，只有版本未变化才能标记为已保存
        if (isLatest()) {
          setDirty(false);
          if (!options.silent) toast.success("已保存");
        }

        return true;
      } catch (error) {
        if (isLatest()) {
          setSaveFailed(true);
          if (!options.silent) {
            toast.error(error instanceof Error ? error.message : "保存失败");
          }
        }
        return false;
      } finally {
        savingCountRef.current = Math.max(0, savingCountRef.current - 1);
        if (savingCountRef.current === 0) setSaving(false);
      }
    },
    [],
  );

  // 串行保存，避免旧请求晚返回时覆盖新内容
  const persistReview = useCallback(
    (payload: SavePayload, options: { silent?: boolean } = {}) => {
      const revision = editRevisionRef.current;
      const run = () => persistReviewNow(payload, options, revision);

      const task = saveQueueRef.current.then(run, run);
      saveQueueRef.current = task.catch(() => false);
      return task;
    },
    [persistReviewNow],
  );

  const saveNow = useCallback(
    (options: { silent?: boolean } = {}) =>
      persistReview(
        { date, rawInput, draft, style, conversation, round },
        options,
      ),
    [persistReview, date, rawInput, draft, style, conversation, round],
  );

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
            toast.error("保存失败，暂时不能记忆");
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
          throw new Error(data.error || "记忆整理失败");
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
                ? `记忆已更新 ${count} 条`
                : `已记住 ${count} 条关键信息`,
            );
          } else if (!options.quiet) {
            toast.info("今天没有需要新增的记忆");
          }
        }
      } catch (error) {
        if (dateRef.current === targetDate) {
          toast.error(
            error instanceof Error ? error.message : "记忆整理失败",
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

  useEffect(() => {
    if (!dirty || loading || hydratedDate !== date) return;
    if (!rawInput.trim() && !hasDraftContent(draft)) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(() => {
      void saveNow({ silent: true });
    }, 1600);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [dirty, loading, hydratedDate, date, rawInput, draft, saveNow]);

  const callGenerate = useCallback(
    async (config: CallConfig): Promise<CallResult> => {
      const inputText = rawInput.trim();

      if (!inputText) {
        throw new Error("先写点今天做了什么");
      }

      if (inputText.length > 6000) {
        throw new Error("内容太长了，先控制在 6000 字以内");
      }

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          rawInput: inputText,
          style: config.style,
          answers: config.answers,
          mode: config.mode,
          round: config.round,
          currentDraft: hasDraftContent(draft) ? draft : undefined,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        draft?: unknown;
        fallback?: boolean;
        warning?: string;
        memories?: unknown;
      };

      if (!response.ok) {
        throw new Error(data.error || "生成失败");
      }

      return {
        draft: normalizeDraft(
          data.draft as Parameters<typeof normalizeDraft>[0],
          {
            maxQuestions:
              config.mode === "questions"
                ? MAX_QUESTIONS_PER_ROUND
                : 0,
          },
        ),
        fallback: Boolean(data.fallback),
        warning: data.warning,
        memories: Array.isArray(data.memories)
          ? (data.memories as MemoryPromptItem[])
          : [],
      };
    },
    [rawInput, date, draft],
  );

  const applyFallback = useCallback(
    async (
      data: Pick<CallResult, "draft" | "warning">,
      config: GenerateConfig,
    ): Promise<boolean> => {
      // AI 不可用时不要覆盖用户已经编辑好的正文
      if (hasDraftContent(draft)) {
        toast.warning(
          data.warning || "AI 暂时不可用，已保留当前草稿，请稍后重试",
          { duration: 6500 },
        );
        return false;
      }

      const nextDraft = normalizeDraft(data.draft, { maxQuestions: 0 });

      setDraft(nextDraft);
      setStyle(config.style);
      setConversation(config.conversationAfter);
      setRound(config.round);
      setUsedMemories([]);
      markDirty();
      setActiveTab("preview");

      toast.warning(data.warning || "AI 暂时不可用，已按原文生成草稿", {
        duration: 6500,
      });

      void persistReview(
        {
          date,
          rawInput: rawInput.trim(),
          draft: nextDraft,
          style: config.style,
          conversation: config.conversationAfter,
          round: config.round,
        },
        { silent: true },
      );

      return true;
    },
    [draft, date, rawInput, persistReview, markDirty],
  );

  const runFinal = useCallback(
    async (config: GenerateConfig): Promise<boolean> => {
      if (!rawInput.trim()) {
        toast.error("先写点今天做了什么");
        setActiveTab("input");
        return false;
      }

      setLoadingMessage("正在生成复盘正文…");
      setLoadingKind("final");

      try {
        const data = await callGenerate({
          mode: config.restyle ? "restyle" : "final",
          style: config.style,
          answers: config.answers,
          round: config.round,
        });

        if (data.fallback) {
          return applyFallback(data, config);
        }

        const nextDraft = normalizeDraft(data.draft, { maxQuestions: 0 });

        setDraft(nextDraft);
        setStyle(config.style);
        setConversation(config.conversationAfter);
        setRound(config.round);
        setUsedMemories(data.memories);
        markDirty();
        setActiveTab("preview");

        toast.success(config.restyle ? "文风已切换" : "整理好了");

        void persistReview(
          {
            date,
            rawInput: rawInput.trim(),
            draft: nextDraft,
            style: config.style,
            conversation: config.conversationAfter,
            round: config.round,
          },
          { silent: true },
        );

        return true;
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "生成失败，请重试",
        );
        return false;
      } finally {
        setLoadingKind(null);
      }
    },
    [rawInput, date, callGenerate, applyFallback, persistReview, markDirty],
  );

  const runQuestions = useCallback(
    async (config: GenerateConfig): Promise<boolean> => {
      if (!rawInput.trim()) {
        toast.error("先写点今天做了什么");
        setActiveTab("input");
        return false;
      }

      if (config.round >= MAX_FOLLOW_UP_ROUNDS) {
        return runFinal(config);
      }

      setLoadingMessage(QUESTION_LOADING_MESSAGES[0]);
      setLoadingKind("questions");

      try {
        const data = await callGenerate({
          mode: "questions",
          style: config.style,
          answers: config.answers,
          round: config.round,
        });

        if (data.fallback) {
          return applyFallback(data, config);
        }

        if (data.draft.questions.length > 0) {
          // 追问只替换问题，保留当前正文和用户手工编辑
          const nextDraft = mergeFollowUpDraft(draft, data.draft);

          setDraft(nextDraft);
          setStyle(config.style);
          setConversation(config.conversationAfter);
          setRound(config.round);
          setUsedMemories(data.memories);
          markDirty();
          setActiveTab("preview");

          void persistReview(
            {
              date,
              rawInput: rawInput.trim(),
              draft: nextDraft,
              style: config.style,
              conversation: config.conversationAfter,
              round: config.round,
            },
            { silent: true },
          );

          return true;
        }

        // 没有新问题，直接生成最终正文
        return runFinal({
          ...config,
          round: Math.min(config.round + 1, MAX_FOLLOW_UP_ROUNDS),
        });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "生成失败，请重试",
        );
        return false;
      } finally {
        setLoadingKind(null);
      }
    },
    [
      rawInput,
      date,
      draft,
      callGenerate,
      applyFallback,
      persistReview,
      runFinal,
      markDirty,
    ],
  );

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
    [conversation, round, style, runQuestions, runFinal],
  );

  const handleSkipQuestions = useCallback(() => {
    if (loading) return;

    const nextRound = Math.min(round + 1, MAX_FOLLOW_UP_ROUNDS);

    void runFinal({
      style,
      answers: conversation,
      round: nextRound,
      conversationAfter: conversation,
    });
  }, [loading, round, style, conversation, runFinal]);

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

        setRawInput(review?.rawInput ?? "");
        setDraft(review ? normalizeDraft(review.draft) : emptyDraft());
        setStyle(review?.style ?? initialSettings.defaultStyle);
        setConversation(review?.conversation ?? []);
        setRound(review?.round ?? 0);
        setSavedAt(review?.updatedAt ?? null);
        setMemoryExtractedAt(review?.memoryExtractedAt ?? null);
        setUsedMemories([]);
        // 让仍挂在旧日期上的保存请求失效，避免误标新日期为已保存
        editRevisionRef.current += 1;
        setDirty(false);
        setSaveFailed(false);
        setHydratedDate(nextDate);
        setActiveTab(
          review && review.draft.questions.length > 0 ? "preview" : "input",
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
      initialSettings.defaultStyle,
    ],
  );

  const handleCopy = useCallback(async () => {
    if (questioning) {
      toast.error("还有追问没回答，先回答或点“跳过追问并生成”");
      return;
    }

    if (!hasDraftContent(draft)) {
      toast.error("还没有可复制的内容");
      return;
    }

    const okay = await copyText(finalText);
    if (okay) {
      toast.success("已复制，去钉钉粘贴吧");

      // 复制视为当天收尾：第一次记忆，正文有更新则刷新；失败不影响复制
      const memoryAction = resolveMemoryCopyAction({
        enabled: initialSettings.enableMemory,
        extractedAt: memoryExtractedAt,
        stale: memoryStale,
      });

      if (memoryAction !== "none") {
        void (async () => {
          const saved = await saveNow({ silent: true });

          if (!saved) {
            toast.error("复盘保存失败，今天的关键信息还没记住");
            return;
          }

          await extractMemory(false, {
            skipSave: true,
            quiet: memoryAction === "refresh",
          });
        })();
      }
    } else {
      toast.error("复制失败，请手动选中文字复制");
    }
  }, [
    questioning,
    draft,
    finalText,
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
      <DateBar
        date={date}
        style={style}
        loading={loading}
        saving={saving}
        dirty={dirty}
        saveFailed={saveFailed}
        savedAt={savedAt}
        onDateChange={(nextDate) => {
          void handleDateChange(nextDate);
        }}
        onStyleChange={handleStyleChange}
        onSave={() => {
          void saveNow();
        }}
      />

      {draft.questions.length > 0 ? (
        <QuestionsCard
          key={`${date}-${round}-${draft.questions
            .map((question) => `${question.id}:${question.text}`)
            .join("|")}`}
          questions={draft.questions}
          round={round}
          maxRounds={MAX_FOLLOW_UP_ROUNDS}
          loading={loading}
          memories={usedMemories}
          onSubmit={(answers) => {
            void handleAnswers(answers);
          }}
          onSkip={handleSkipQuestions}
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
            key={date}
            value={rawInput}
            students={initialStudents}
            hasDraft={hasFinalContent}
            questioning={questioning}
            loading={loading}
            onChange={(value) => {
              setRawInput(value);
              markDirty();
            }}
            onGenerate={handleGenerate}
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
            hasContent={hasFinalContent}
            waitingForAnswers={questioning}
            loading={loading}
            loadingMessage={loadingMessage}
            notes={draft.notes}
            memories={usedMemories}
            memoryEnabled={initialSettings.enableMemory}
            memoryExtractedAt={memoryExtractedAt}
            memoryStale={memoryStale}
            extractingMemory={extractingMemory}
            onCopy={() => {
              void handleCopy();
            }}
            onEdit={() => setEditorOpen(true)}
            onRegenerate={handleGenerate}
            onExtractMemory={() => {
              void extractMemory(true);
            }}
          />
        </div>
      </div>

      <DraftEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        draft={draft}
        settings={initialSettings}
        onSave={handleEditorSave}
      />

      {!questioning ? (
        <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 border-t-2 border-line/70 bg-cream/95 p-3 backdrop-blur-md md:hidden">
          {activeTab === "input" ? (
            <Button
              className="w-full"
              size="lg"
              loading={loading}
              onClick={handleGenerate}
            >
              {!loading ? <Sparkles className="h-4 w-4" /> : null}
              {hasFinalContent ? "重新生成" : "生成复盘"}
            </Button>
          ) : (
            <Button
              className="w-full"
              size="lg"
              onClick={() => {
                void handleCopy();
              }}
              disabled={!hasFinalContent || loading}
            >
              <Copy className="h-4 w-4" />
              复制到钉钉
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
