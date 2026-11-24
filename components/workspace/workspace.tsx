"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
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
import {
  answersFromConversation,
  type QuestionAnswer,
} from "@/lib/answers";
import { trackClientEvent } from "@/lib/analytics/client";
import { copyText } from "@/lib/clipboard";
import { isValidISODate, relativeDateLabel, todayISO } from "@/lib/date";
import { mergeFollowUpDraft, normalizeDraft } from "@/lib/draft";
import {
  beginGeneration,
  clearGeneration,
  clearPersistedGeneration,
  failGeneration,
  generationMatchesReview,
  getGenerationJob,
  markGenerationSaveFailed,
  markGenerationSaved,
  readPersistedGeneration,
  subscribeGeneration,
  updateGenerationResult,
  type GenerationJob,
} from "@/lib/generation-store";
import type {
  PartialText,
  SectionStreamEntry,
} from "@/lib/ai/stream-parser";
import {
  isMemoryExtractionStale,
  resolveMemoryCopyAction,
} from "@/lib/memory";
import { SSEDecoder } from "@/lib/sse";
import { SAMPLE_DRAFT } from "@/lib/sample";
import { setSelectedDate } from "@/lib/selected-date";
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
import { DraftCard } from "./draft-card";
import { DraftEditor } from "./draft-editor";
import { QuestionsCard } from "./questions-card";
import { RawInputCard } from "./raw-input-card";
import type { SaveStatus } from "./workspace-date";

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
  rawInput?: string;
  restyle?: boolean;
};

type CallConfig = {
  mode: "questions" | "final" | "restyle";
  style: ReviewStyle;
  answers: QAPair[];
  round: number;
  conversationAfter: QAPair[];
  rawInput?: string;
};

type CallResult = {
  jobId: string;
  draft: ReviewDraft;
  fallback: boolean;
  warning?: string;
  memories: MemoryPromptItem[];
};

/** 把流式推送的增量条目并到已有结果里 */
function mergeSectionEntry(
  previous: SectionStreamEntry[],
  entry: SectionStreamEntry,
): SectionStreamEntry[] {
  const index = previous.findIndex((item) => item.key === entry.key);

  if (index < 0) return [...previous, entry];

  const next = [...previous];
  next[index] = {
    key: entry.key,
    items: [...next[index].items, ...entry.items],
  };

  return next;
}

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
  // 流式生成时已经收到的完整条目，生成结束后清空、交给正式草稿
  const [streamingSections, setStreamingSections] = useState<
    SectionStreamEntry[]
  >([]);
  const [streamingPartial, setStreamingPartial] =
    useState<PartialText | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(
    Boolean(jobForDate?.status === "done" && jobForDate.saveFailed),
  );
  const [savedAt, setSavedAt] = useState<string | null>(
    jobForDate?.savedAt ?? initialReview?.updatedAt ?? null,
  );
  const [dirty, setDirty] = useState(
    Boolean(jobForDate?.status === "done" && jobForDate.saveFailed),
  );
  // 归档是 UI 状态：显式点「保存」后标记，后续有改动会回到自动暂存
  const [archived, setArchived] = useState(
    Boolean(initialReview?.finalText.trim()),
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
  const [recoveryJob, setRecoveryJob] = useState<GenerationJob | null>(
    null,
  );
  const [checkingRecovery, setCheckingRecovery] = useState(false);
  const extractingMemoryRef = useRef(false);
  const dateRef = useRef(date);
  const savedAtRef = useRef<string | null>(
    initialReview?.updatedAt ?? null,
  );
  const mountedRef = useRef(false);
  const pageUnloadingRef = useRef(false);
  const activeJobIdRef = useRef<string | null>(null);
  const latestPayloadRef = useRef<SavePayload | null>(null);
  const dirtyRef = useRef(false);
  const draftQuestionsRef = useRef(draft.questions);
  const [activeTab, setActiveTab] = useState<"input" | "preview">(
    jobWaiting || jobForDate?.status === "done" ? "preview" : "input",
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [hydratedDate, setHydratedDate] = useState(initialDate);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const savingCountRef = useRef(0);
  const editRevisionRef = useRef(0);

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
    setArchived(false);
  }, []);

  const finishLocalJob = useCallback((jobId: string) => {
    if (!mountedRef.current || pageUnloadingRef.current) return;

    if (activeJobIdRef.current === jobId) {
      activeJobIdRef.current = null;
    }
    clearGeneration(jobId);
  }, []);

  useEffect(() => {
    draftQuestionsRef.current = draft.questions;
  }, [draft.questions]);

  // 页面切回来后，接管仍在跑的生成任务，恢复等待状态或应用结果
  const applyGenerationJob = useCallback(() => {
    if (pageUnloadingRef.current) return;

    const job = getGenerationJob();
    if (!job || job.date !== date) return;
    if (job.id === activeJobIdRef.current) return;

    if (job.status === "loading" || job.status === "saving") {
      setLoadingKind(job.mode === "questions" ? "questions" : "final");
      setLoadingMessage(
        job.mode === "questions"
          ? QUESTION_LOADING_MESSAGES[0]
          : "正在生成复盘正文…",
      );
      setRawInput(job.rawInput);
      setStyle(job.style);
      setConversation(job.conversationAfter);
      setRound(job.round);
      setActiveTab("preview");
      return;
    }

    if (job.status === "error") {
      setLoadingKind(null);
      setRawInput(job.rawInput);
      setStyle(job.style);
      setConversation(job.conversationAfter);
      setRound(job.round);
      setRestoredAnswers(
        answersFromConversation(
          draftQuestionsRef.current,
          job.conversationAfter,
        ),
      );
      setActiveTab("input");
      toast.error(job.error || "生成失败，请重试");
      clearGeneration(job.id);
      return;
    }

    const result = job.result;

    setLoadingKind(null);
    setRawInput(job.rawInput);
    setStyle(job.style);
    setConversation(job.conversationAfter);
    setRound(job.round);
    setUsedMemories(result?.memories ?? []);
    setSavedAt(job.savedAt ?? null);
    setSaveFailed(Boolean(job.saveFailed));
    setDirty(Boolean(job.saveFailed || !job.savedAt));
    setRestoredAnswers({});
    setActiveTab("preview");

    if (result) {
      if (!result.ignored) {
        setDraft(normalizeDraft(result.draft));
      }

      if (job.mode === "restyle") {
        toast.success("文风已切换");
      } else if (job.mode === "final") {
        toast.success("整理好了");
      }

      if (result.warning) {
        toast.warning(result.warning, { duration: 6500 });
      }
    }

    if (job.saveFailed) {
      toast.error("生成好了，但保存失败，请点击保存重试");
    }

    clearGeneration(job.id);
  }, [date]);

  useEffect(() => {
    let cancelled = false;

    const apply = () => {
      if (cancelled) return;
      applyGenerationJob();
    };

    // 挂载时可能已经有任务在跑，延后一拍接管
    const timer = setTimeout(apply, 0);
    const unsubscribe = subscribeGeneration(apply);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [applyGenerationJob]);

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

        const nextSavedAt =
          data.review?.updatedAt ?? new Date().toISOString();
        savedAtRef.current = nextSavedAt;
        setSavedAt(nextSavedAt);

        // 请求期间用户可能又改了内容，只有版本未变化才能标记为已保存
        if (isLatest()) {
          setDirty(false);
          if (!options.silent) toast.success("已保存");
        }

        // 上一次生成保存失败后，手动或自动保存成功时清掉恢复标记
        const job = getGenerationJob();
        if (job && job.date === payload.date && job.saveFailed) {
          if (activeJobIdRef.current === job.id) {
            activeJobIdRef.current = null;
          }
          clearGeneration(job.id);
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

  useEffect(() => {
    latestPayloadRef.current = {
      date,
      rawInput,
      draft,
      style,
      conversation,
      round,
    };
    dirtyRef.current = dirty;
  }, [date, rawInput, draft, style, conversation, round, dirty]);

  // 切页时补存还没落库的输入；有生成任务时交给生成任务自己保存
  useEffect(() => {
    return () => {
      if (!dirtyRef.current) return;

      const job = getGenerationJob();

      if (
        job &&
        job.date === dateRef.current &&
        job.status !== "error" &&
        !job.saveFailed
      ) {
        return;
      }

      const payload = latestPayloadRef.current;
      if (payload) void persistReview(payload, { silent: true });
    };
  }, [persistReview]);

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
  }, [hasAnyInput, draft, saveNow]);

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

  /** 读取 SSE 流，边收边更新预览，最后返回结构化草稿 */
  const readStreamResponse = useCallback(
    async (
      response: Response,
      jobId: string,
      maxQuestions: number,
    ): Promise<CallResult> => {
      const reader = response.body?.getReader();
      if (!reader) throw new Error("当前浏览器不支持流式读取");

      const decoder = new TextDecoder();
      const sse = new SSEDecoder();
      let result: CallResult | null = null;
      let streamError = "";

      setStreamingSections([]);
      setStreamingPartial(null);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          for (const event of sse.push(decoder.decode(value, { stream: true }))) {
            if (event.event === "status") {
              const payload = event.data as { message?: string };
              if (payload.message) setLoadingMessage(payload.message);
              continue;
            }

            if (event.event === "section") {
              const entry = event.data as SectionStreamEntry;
              setStreamingSections((previous) =>
                mergeSectionEntry(previous, entry),
              );
              setStreamingPartial(null);
              continue;
            }

            if (event.event === "partial") {
              setStreamingPartial(event.data as PartialText);
              continue;
            }

            if (event.event === "done") {
              const payload = event.data as {
                draft?: unknown;
                fallback?: boolean;
                warning?: string;
                memories?: unknown;
              };

              result = {
                jobId,
                draft: normalizeDraft(
                  payload.draft as Parameters<typeof normalizeDraft>[0],
                  { maxQuestions },
                ),
                fallback: Boolean(payload.fallback),
                warning: payload.warning,
                memories: Array.isArray(payload.memories)
                  ? (payload.memories as MemoryPromptItem[])
                  : [],
              };
              continue;
            }

            if (event.event === "error") {
              const payload = event.data as { message?: string };
              streamError = payload.message || "生成失败";
            }
          }
        }
      } finally {
        setStreamingSections([]);
        setStreamingPartial(null);
      }

      if (!result) {
        throw new Error(streamError || "流式生成没有返回结果");
      }

      return result;
    },
    [],
  );

  const callGenerate = useCallback(
    async (config: CallConfig): Promise<CallResult> => {
      const inputText = (config.rawInput ?? rawInput).trim();

      if (!inputText) {
        throw new Error("先写点今天做了什么");
      }

      if (inputText.length > 6000) {
        throw new Error("内容太长了，先控制在 6000 字以内");
      }

      setRecoveryJob(null);

      const job = beginGeneration({
        date,
        mode: config.mode,
        rawInput: inputText,
        style: config.style,
        answers: config.answers,
        round: config.round,
        conversationAfter: config.conversationAfter,
        baselineSavedAt: savedAtRef.current,
      });
      activeJobIdRef.current = job.id;

      const wantsStream = config.mode === "final";
      const maxQuestions =
        config.mode === "questions" ? MAX_QUESTIONS_PER_ROUND : 0;
      const payload = {
        date,
        rawInput: inputText,
        style: config.style,
        answers: config.answers,
        mode: config.mode,
        round: config.round,
        currentDraft: hasDraftContent(draft) ? draft : undefined,
      };

      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            stream: wantsStream || undefined,
          }),
        });

        const contentType = response.headers.get("Content-Type") ?? "";
        const canStream =
          wantsStream &&
          response.ok &&
          Boolean(response.body) &&
          contentType.includes("text/event-stream");

        if (canStream && response.body) {
          try {
            return await readStreamResponse(response, job.id, maxQuestions);
          } catch (streamFailure) {
            console.warn(
              "[stream] 流式失败，回退非流式：",
              streamFailure instanceof Error
                ? streamFailure.message
                : streamFailure,
            );
          }
        }

        // 非流式请求，或者流式失败后的兜底重发
        const retry =
          canStream && response.body
            ? await fetch("/api/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              })
            : response;

        const data = (await retry.json().catch(() => ({}))) as {
          error?: string;
          draft?: unknown;
          fallback?: boolean;
          warning?: string;
          memories?: unknown;
        };

        if (!retry.ok) {
          throw new Error(data.error || "生成失败");
        }

        return {
          jobId: job.id,
          draft: normalizeDraft(
            data.draft as Parameters<typeof normalizeDraft>[0],
            { maxQuestions },
          ),
          fallback: Boolean(data.fallback),
          warning: data.warning,
          memories: Array.isArray(data.memories)
            ? (data.memories as MemoryPromptItem[])
            : [],
        };
      } catch (error) {
        failGeneration(
          job.id,
          error instanceof Error ? error.message : "生成失败",
        );

        if (mountedRef.current && !pageUnloadingRef.current) {
          if (activeJobIdRef.current === job.id) {
            activeJobIdRef.current = null;
          }
          clearGeneration(job.id);
        }

        throw error;
      }
    },
    [rawInput, date, draft, readStreamResponse],
  );

  const applyFallback = useCallback(
    async (
      data: Pick<CallResult, "jobId" | "draft" | "warning">,
      config: GenerateConfig,
    ): Promise<boolean> => {
      // AI 不可用时不要覆盖用户已经编辑好的正文
      if (hasDraftContent(draft)) {
        updateGenerationResult(data.jobId, {
          draft,
          fallback: true,
          warning: data.warning,
          memories: [],
          ignored: true,
        });
        markGenerationSaved(
          data.jobId,
          savedAtRef.current ?? new Date().toISOString(),
        );
        finishLocalJob(data.jobId);
        toast.warning(
          data.warning || "生成服务暂时不可用，已保留当前草稿，请稍后重试",
          { duration: 6500 },
        );
        return false;
      }

      const nextDraft = normalizeDraft(data.draft, { maxQuestions: 0 });

      updateGenerationResult(data.jobId, {
        draft: nextDraft,
        fallback: true,
        warning: data.warning,
        memories: [],
      });

      setDraft(nextDraft);
      setStyle(config.style);
      setConversation(config.conversationAfter);
      setRound(config.round);
      setUsedMemories([]);
      setRestoredAnswers({});
      markDirty();
      setActiveTab("preview");
      setLoadingKind(null);

      const saved = await persistReview(
        {
          date,
          rawInput: (config.rawInput ?? rawInput).trim(),
          draft: nextDraft,
          style: config.style,
          conversation: config.conversationAfter,
          round: config.round,
        },
        { silent: true },
      );

      if (saved) {
        markGenerationSaved(
          data.jobId,
          savedAtRef.current ?? new Date().toISOString(),
        );
        finishLocalJob(data.jobId);
      } else {
        markGenerationSaveFailed(data.jobId);
        if (mountedRef.current) {
          toast.error("草稿保存失败，请点击保存重试");
        }
      }

      toast.warning(data.warning || "生成服务暂时不可用，已按原文生成草稿", {
        duration: 6500,
      });

      return true;
    },
    [
      draft,
      date,
      rawInput,
      persistReview,
      markDirty,
      finishLocalJob,
    ],
  );

  const runFinal = useCallback(
    async (config: GenerateConfig): Promise<boolean> => {
      if (!(config.rawInput ?? rawInput).trim()) {
        toast.error("先写点今天做了什么");
        setActiveTab("input");
        return false;
      }

      // 移动端切到预览，让加载态和结果立刻可见
      setActiveTab("preview");
      setLoadingMessage("正在生成复盘正文…");
      setLoadingKind("final");

      try {
        const data = await callGenerate({
          mode: config.restyle ? "restyle" : "final",
          style: config.style,
          answers: config.answers,
          round: config.round,
          conversationAfter: config.conversationAfter,
        });

        if (data.fallback) {
          return applyFallback(data, config);
        }

        const nextDraft = normalizeDraft(data.draft, { maxQuestions: 0 });

        updateGenerationResult(data.jobId, {
          draft: nextDraft,
          fallback: false,
          memories: data.memories,
        });

        setDraft(nextDraft);
        setStyle(config.style);
        setConversation(config.conversationAfter);
        setRound(config.round);
        setUsedMemories(data.memories);
        setRestoredAnswers({});
        markDirty();
        setActiveTab("preview");
        setLoadingKind(null);

        toast.success(config.restyle ? "文风已切换" : "整理好了");

        const saved = await persistReview(
          {
            date,
            rawInput: (config.rawInput ?? rawInput).trim(),
            draft: nextDraft,
            style: config.style,
            conversation: config.conversationAfter,
            round: config.round,
          },
          { silent: true },
        );

        if (saved) {
          markGenerationSaved(
            data.jobId,
            savedAtRef.current ?? new Date().toISOString(),
          );
          finishLocalJob(data.jobId);
        } else {
          markGenerationSaveFailed(data.jobId);
          if (mountedRef.current) {
            toast.error("生成好了，但保存失败，请点击保存重试");
          }
        }

        return true;
      } catch (error) {
        setRestoredAnswers(
          answersFromConversation(
            draft.questions,
            config.conversationAfter,
          ),
        );
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
      markDirty,
      finishLocalJob,
    ],
  );

  const runQuestions = useCallback(
    async (config: GenerateConfig): Promise<boolean> => {
      if (!(config.rawInput ?? rawInput).trim()) {
        toast.error("先写点今天做了什么");
        setActiveTab("input");
        return false;
      }

      // 移动端切到预览，让加载态和追问立刻可见
      setActiveTab("preview");

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
          conversationAfter: config.conversationAfter,
        });

        if (data.fallback) {
          return applyFallback(data, config);
        }

        if (data.draft.questions.length > 0) {
          // 追问只替换问题，保留当前正文和用户手工编辑
          const nextDraft = mergeFollowUpDraft(draft, data.draft);

          updateGenerationResult(data.jobId, {
            draft: nextDraft,
            fallback: false,
            memories: data.memories,
          });

          setDraft(nextDraft);
          setStyle(config.style);
          setConversation(config.conversationAfter);
          setRound(config.round);
          setUsedMemories(data.memories);
          setRestoredAnswers({});
          markDirty();
          setActiveTab("preview");
          setLoadingKind(null);

          const saved = await persistReview(
            {
              date,
              rawInput: (config.rawInput ?? rawInput).trim(),
              draft: nextDraft,
              style: config.style,
              conversation: config.conversationAfter,
              round: config.round,
            },
            { silent: true },
          );

          if (saved) {
            markGenerationSaved(
              data.jobId,
              savedAtRef.current ?? new Date().toISOString(),
            );
            finishLocalJob(data.jobId);
          } else {
            markGenerationSaveFailed(data.jobId);
            if (mountedRef.current) {
              toast.error("追问已生成，但保存失败，请点击保存重试");
            }
          }

          return true;
        }

        // 没有新问题，直接生成最终正文
        clearGeneration(data.jobId);
        if (activeJobIdRef.current === data.jobId) {
          activeJobIdRef.current = null;
        }
        return runFinal({
          ...config,
          round: Math.min(config.round + 1, MAX_FOLLOW_UP_ROUNDS),
        });
      } catch (error) {
        setRestoredAnswers(
          answersFromConversation(
            draft.questions,
            config.conversationAfter,
          ),
        );
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
      finishLocalJob,
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

  const applyReviewRecord = useCallback(
    (review: ReviewRecord | null) => {
      setRawInput(review?.rawInput ?? "");
      setDraft(review ? normalizeDraft(review.draft) : emptyDraft());
      setStyle(review?.style ?? initialSettings.defaultStyle);
      setConversation(review?.conversation ?? []);
      setRound(review?.round ?? 0);
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
    [initialSettings.defaultStyle],
  );

  const applyRecoveredResult = useCallback((job: GenerationJob) => {
    const result = job.result;
    if (!result) return;

    setRawInput(job.rawInput);
    setStyle(job.style);
    setConversation(job.conversationAfter);
    setRound(job.round);
    setUsedMemories(result.memories);
    setRestoredAnswers({});
    setArchived(false);

    if (!result.ignored) {
      setDraft(normalizeDraft(result.draft));
      setSavedAt(null);
      setSaveFailed(false);
      setDirty(true);
      setActiveTab("preview");
    }

    if (result.warning) {
      toast.warning(result.warning, { duration: 6500 });
    }
  }, []);

  // 整页刷新后恢复上一次生成：先查库，再决定应用结果还是提示重试
  useEffect(() => {
    if (getGenerationJob()) return;

    const persisted = readPersistedGeneration();
    if (!persisted || persisted.date !== date) return;

    let cancelled = false;

    void (async () => {
      let review: ReviewRecord | null = null;

      try {
        const response = await fetch(`/api/reviews?date=${persisted.date}`);
        const data = (await response.json().catch(() => ({}))) as {
          review?: ReviewRecord | null;
        };
        if (response.ok) review = data.review ?? null;
      } catch {
        // 查库失败时按未完成处理，让用户选择检查或重试
      }

      if (cancelled || getGenerationJob()) return;

      setRawInput(persisted.rawInput);
      setStyle(persisted.style);
      setConversation(persisted.conversationAfter);
      setRound(persisted.round);

      if (review && generationMatchesReview(persisted, review)) {
        clearPersistedGeneration();
        applyReviewRecord(review);
        toast.success("上次生成已经完成");
        return;
      }

      if (persisted.result) {
        clearPersistedGeneration();
        applyRecoveredResult(persisted);
        toast.info("已恢复上次生成结果，正在保存");
        return;
      }

      setRecoveryJob(persisted);
    })();

    return () => {
      cancelled = true;
    };
  }, [date, applyReviewRecord, applyRecoveredResult]);

  const handleCheckRecovery = useCallback(async () => {
    const job = recoveryJob;
    if (!job || checkingRecovery) return;

    setCheckingRecovery(true);

    try {
      const response = await fetch(`/api/reviews?date=${job.date}`);
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        review?: ReviewRecord | null;
      };

      if (!response.ok) {
        throw new Error(data.error || "检查失败");
      }

      const review = data.review ?? null;

      if (review && generationMatchesReview(job, review)) {
        clearPersistedGeneration();
        applyReviewRecord(review);
        setRecoveryJob(null);
        toast.success("上次生成已经完成");
      } else {
        toast.info("还没查到生成结果，可以点“继续生成”");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "检查失败");
    } finally {
      setCheckingRecovery(false);
    }
  }, [recoveryJob, checkingRecovery, applyReviewRecord]);

  const handleRetryRecovery = useCallback(() => {
    const job = recoveryJob;
    if (!job || loading) return;

    setRecoveryJob(null);
    setRawInput(job.rawInput);
    setStyle(job.style);
    setConversation(job.conversationAfter);
    setRound(job.round);

    const config = {
      style: job.style,
      answers: job.answers,
      round: job.round,
      conversationAfter: job.conversationAfter,
      rawInput: job.rawInput,
    };

    if (job.mode === "questions") {
      void runQuestions(config);
    } else {
      void runFinal({ ...config, restyle: job.mode === "restyle" });
    }
  }, [recoveryJob, loading, runQuestions, runFinal]);

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
      return;
    }

    if (!hasDraftContent(draft)) {
      toast.error("还没有可复制的内容");
      return;
    }

    const okay = await copyText(finalText);
    if (!okay) {
      toast.error("复制失败，请手动选中文字复制");
      return;
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
      return;
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
        <section className="paper-card p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-butter-soft text-[#8a6a2f]">
              <RefreshCw className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-ink">
                上次生成还没完成
              </h2>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                刷新或关页会中断生成，可以检查结果或继续生成。
              </p>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              loading={checkingRecovery}
              onClick={() => {
                void handleCheckRecovery();
              }}
            >
              检查结果
            </Button>
            <Button
              size="sm"
              disabled={loading}
              onClick={handleRetryRecovery}
            >
              继续生成
            </Button>
          </div>
        </section>
      ) : null}

      <div className="lg:hidden">
        <Segmented
          options={
            questioning
              ? [
                  { value: "input" as const, label: "流水账" },
                  { value: "preview" as const, label: "追问" },
                ]
              : [
                  { value: "input" as const, label: "输入" },
                  { value: "preview" as const, label: "预览" },
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
              questioning && !loading
                ? "questions"
                : loading
                  ? "draft-loading"
                  : "draft"
            }
            className="panel-swap"
          >
            {questioning && !loading ? (
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
                onCopy={() => {
                  void handleCopy();
                }}
                onEdit={() => setEditorOpen(true)}
                onRegenerate={handleGenerate}
                onExtractMemory={() => {
                  void extractMemory(true);
                }}
                streaming={streamingSections}
                streamingPartial={streamingPartial}
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
