"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { toast } from "sonner";
import { answersFromConversation, type QuestionAnswer } from "@/lib/answers";
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
import {
  MAX_FOLLOW_UP_ROUNDS,
  MAX_QUESTIONS_PER_ROUND,
  hasDraftContent,
  type MemoryPromptItem,
  type QAPair,
  type ReviewDraft,
  type ReviewRecord,
  type ReviewStyle,
} from "@/lib/types";
import {
  QUESTION_LOADING_MESSAGES,
  type CallConfig,
  type CallResult,
  type GenerateConfig,
  type LoadingKind,
  type SavePayload,
} from "./workspace-shared";

type Params = {
  date: string;
  rawInput: string;
  draft: ReviewDraft;

  loadingKind: LoadingKind;
  setLoadingKind: (kind: LoadingKind) => void;
  setLoadingMessage: (message: string) => void;

  setRawInput: (value: string) => void;
  setStyle: (style: ReviewStyle) => void;
  setDraft: (draft: ReviewDraft) => void;
  setConversation: (conversation: QAPair[]) => void;
  setRound: (round: number) => void;
  setRawBaseline: (value: string) => void;
  setUsedMemories: (memories: MemoryPromptItem[]) => void;
  setRestoredAnswers: (answers: Record<string, QuestionAnswer>) => void;
  setActiveTab: (tab: "input" | "preview") => void;

  markDirty: () => void;
  persistReview: (
    payload: SavePayload,
    options?: { silent?: boolean },
  ) => Promise<boolean>;
  savedAtRef: RefObject<string | null>;
  setSavedAt: (value: string | null) => void;
  setSaveFailed: (value: boolean) => void;
  setDirty: (value: boolean) => void;
  setArchived: (value: boolean) => void;

  activeJobIdRef: RefObject<string | null>;
  mountedRef: RefObject<boolean>;
  pageUnloadingRef: RefObject<boolean>;
  /** 当前正在展示的日期，异步回调里用它判断结果是否已经过期 */
  dateRef: RefObject<string>;

  onLoadReview: (review: ReviewRecord | null) => void;
};

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * 生成层：追问 / 成稿 / 换文风、
 * generation-store 同步与刷新后的中断恢复。
 */
export function useReviewGeneration({
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
  dateRef,
  onLoadReview,
}: Params) {
  const [recoveryJob, setRecoveryJob] = useState<GenerationJob | null>(null);
  const [checkingRecovery, setCheckingRecovery] = useState(false);
  const draftQuestionsRef = useRef(draft.questions);
  const loading = loadingKind !== null;
  // 同步锁：state 更新是异步的，连击时用 ref 才能真正挡住第二次调用
  const runLockRef = useRef<symbol | null>(null);
  const generateAbortRef = useRef<AbortController | null>(null);
  const recoveryAbortRef = useRef<AbortController | null>(null);
  const recoveryCheckRef = useRef<symbol | null>(null);

  // 切日或卸载时中止所有在途请求
  useEffect(() => {
    return () => {
      generateAbortRef.current?.abort();
      generateAbortRef.current = null;
      recoveryAbortRef.current?.abort();
      recoveryAbortRef.current = null;
    };
  }, [date]);

  useEffect(() => {
    draftQuestionsRef.current = draft.questions;
  }, [draft.questions]);

  useEffect(() => {
    if (loadingKind !== "questions") return;

    let index = 0;

    const timer = setInterval(() => {
      index = (index + 1) % QUESTION_LOADING_MESSAGES.length;
      setLoadingMessage(QUESTION_LOADING_MESSAGES[index]);
    }, 2400);

    return () => clearInterval(timer);
  }, [loadingKind, setLoadingMessage]);

  const finishLocalJob = useCallback(
    (jobId: string) => {
      if (!mountedRef.current || pageUnloadingRef.current) return;

      if (activeJobIdRef.current === jobId) {
        activeJobIdRef.current = null;
      }
      clearGeneration(jobId);
    },
    [activeJobIdRef, mountedRef, pageUnloadingRef],
  );

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
      setRawBaseline(job.rawInput.trim());
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
    setRawBaseline(job.rawInput.trim());
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
  }, [
    date,
    activeJobIdRef,
    pageUnloadingRef,
    setActiveTab,
    setConversation,
    setDirty,
    setDraft,
    setLoadingKind,
    setLoadingMessage,
    setRawBaseline,
    setRawInput,
    setRestoredAnswers,
    setRound,
    setSaveFailed,
    setSavedAt,
    setStyle,
    setUsedMemories,
  ]);

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

  const callGenerate = useCallback(
    async (config: CallConfig): Promise<CallResult> => {
      const inputText = (config.rawInput ?? rawInput).trim();

      if (!inputText) {
        throw new Error("先写点今天做了什么");
      }

      if (inputText.length > 6000) {
        throw new Error("内容太长了，先控制在 6000 字以内");
      }

      if (!mountedRef.current || dateRef.current !== date) {
        throw new Error("页面状态已变化，请重试");
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

      // 重跑时中止上一次生成请求，旧结果晚到也不能再应用
      generateAbortRef.current?.abort();
      const controller = new AbortController();
      generateAbortRef.current = controller;

      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
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

        // 请求回来时可能已经切日、卸载或发起了新的生成
        const stale =
          !mountedRef.current ||
          pageUnloadingRef.current ||
          dateRef.current !== date ||
          activeJobIdRef.current !== job.id;

        if (stale) {
          throw new Error("生成结果已过期");
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
        // 主动中止不是失败，交给上层静默结束
        if (isAbortError(error)) throw error;

        const stale =
          !mountedRef.current ||
          pageUnloadingRef.current ||
          dateRef.current !== date ||
          activeJobIdRef.current !== job.id;

        if (!stale) {
          failGeneration(
            job.id,
            error instanceof Error ? error.message : "生成失败",
          );
          activeJobIdRef.current = null;
          clearGeneration(job.id);
        }

        throw error;
      } finally {
        if (generateAbortRef.current === controller) {
          generateAbortRef.current = null;
        }
      }
    },
    [
      rawInput,
      date,
      draft,
      activeJobIdRef,
      mountedRef,
      pageUnloadingRef,
      dateRef,
      savedAtRef,
    ],
  );

  const applyFallback = useCallback(
    async (
      data: Pick<CallResult, "jobId" | "draft" | "warning">,
      config: GenerateConfig,
    ): Promise<boolean> => {
      // 期间可能已经切日、卸载或发起新任务，旧结果直接丢弃
      if (
        !mountedRef.current ||
        pageUnloadingRef.current ||
        dateRef.current !== date ||
        activeJobIdRef.current !== data.jobId
      ) {
        return false;
      }

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
      setRawBaseline((config.rawInput ?? rawInput).trim());
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
      mountedRef,
      pageUnloadingRef,
      dateRef,
      activeJobIdRef,
      savedAtRef,
      setActiveTab,
      setConversation,
      setDraft,
      setLoadingKind,
      setRawBaseline,
      setRestoredAnswers,
      setRound,
      setStyle,
      setUsedMemories,
    ],
  );

  const runFinal = useCallback(
    async (config: GenerateConfig): Promise<boolean> => {
      if (!(config.rawInput ?? rawInput).trim()) {
        toast.error("先写点今天做了什么");
        setActiveTab("input");
        return false;
      }

      // 同步锁挡住连击：loading 是异步 state，同一帧的第二次点击拦不住
      if (runLockRef.current) return false;
      const runToken = Symbol("final-run");
      runLockRef.current = runToken;

      try {
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

          if (
            !mountedRef.current ||
            pageUnloadingRef.current ||
            dateRef.current !== date ||
            activeJobIdRef.current !== data.jobId
          ) {
            return false;
          }

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
          setRawBaseline((config.rawInput ?? rawInput).trim());
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
          // 主动中止：不提示错误，也不回填答案
          if (isAbortError(error)) return false;

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
          if (mountedRef.current) setLoadingKind(null);
        }
      } finally {
        if (runLockRef.current === runToken) runLockRef.current = null;
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
      mountedRef,
      pageUnloadingRef,
      dateRef,
      activeJobIdRef,
      savedAtRef,
      setActiveTab,
      setConversation,
      setDraft,
      setLoadingKind,
      setLoadingMessage,
      setRawBaseline,
      setRestoredAnswers,
      setRound,
      setStyle,
      setUsedMemories,
    ],
  );

  const runQuestions = useCallback(
    async (config: GenerateConfig): Promise<boolean> => {
      if (!(config.rawInput ?? rawInput).trim()) {
        toast.error("先写点今天做了什么");
        setActiveTab("input");
        return false;
      }

      // 与 runFinal 共用同一把同步锁
      if (runLockRef.current) return false;
      const runToken = Symbol("questions-run");
      runLockRef.current = runToken;

      try {
        // 移动端切到预览，让加载态和追问立刻可见
        setActiveTab("preview");

        if (config.round >= MAX_FOLLOW_UP_ROUNDS) {
          // 交给最终稿生成，先释放追问的锁让 runFinal 拿自己的锁
          if (runLockRef.current === runToken) runLockRef.current = null;
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

          if (
            !mountedRef.current ||
            pageUnloadingRef.current ||
            dateRef.current !== date ||
            activeJobIdRef.current !== data.jobId
          ) {
            return false;
          }

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
            setRawBaseline((config.rawInput ?? rawInput).trim());
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

          if (runLockRef.current === runToken) runLockRef.current = null;
          return runFinal({
            ...config,
            round: Math.min(config.round + 1, MAX_FOLLOW_UP_ROUNDS),
          });
        } catch (error) {
          if (isAbortError(error)) return false;

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
          if (mountedRef.current) setLoadingKind(null);
        }
      } finally {
        if (runLockRef.current === runToken) runLockRef.current = null;
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
      activeJobIdRef,
      mountedRef,
      pageUnloadingRef,
      dateRef,
      savedAtRef,
      setActiveTab,
      setConversation,
      setDraft,
      setLoadingKind,
      setLoadingMessage,
      setRawBaseline,
      setRestoredAnswers,
      setRound,
      setStyle,
      setUsedMemories,
    ],
  );

  const applyRecoveredResult = useCallback(
    (job: GenerationJob) => {
      const result = job.result;
      if (!result) return;

      setRawInput(job.rawInput);
      setStyle(job.style);
      setConversation(job.conversationAfter);
      setRound(job.round);
      setRawBaseline(job.rawInput.trim());
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
    },
    [
      setActiveTab,
      setArchived,
      setConversation,
      setDirty,
      setDraft,
      setRawBaseline,
      setRawInput,
      setRestoredAnswers,
      setRound,
      setSaveFailed,
      setSavedAt,
      setStyle,
      setUsedMemories,
    ],
  );

  // 整页刷新后恢复上一次生成：先查库，再决定应用结果还是提示重试
  useEffect(() => {
    if (getGenerationJob()) return;

    const persisted = readPersistedGeneration();
    if (!persisted || persisted.date !== date) return;

    let cancelled = false;
    const controller = new AbortController();

    void (async () => {
      let review: ReviewRecord | null = null;

      try {
        const response = await fetch(`/api/reviews?date=${persisted.date}`, {
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => ({}))) as {
          review?: ReviewRecord | null;
        };
        if (response.ok) review = data.review ?? null;
      } catch {
        // 查库失败或请求被中止时按未完成处理，让用户选择检查或重试
      }

      if (cancelled || getGenerationJob()) return;

      setRawInput(persisted.rawInput);
      setStyle(persisted.style);
      setConversation(persisted.conversationAfter);
      setRound(persisted.round);

      if (review && generationMatchesReview(persisted, review)) {
        clearPersistedGeneration();
        onLoadReview(review);
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
      controller.abort();
    };
  }, [
    date,
    onLoadReview,
    applyRecoveredResult,
    setRawInput,
    setStyle,
    setConversation,
    setRound,
  ]);

  const handleCheckRecovery = useCallback(async () => {
    const job = recoveryJob;
    if (!job || checkingRecovery || recoveryCheckRef.current) return;

    const checkToken = Symbol("recovery-check");
    recoveryCheckRef.current = checkToken;
    setCheckingRecovery(true);

    // 重复点击时中止上一次检查
    recoveryAbortRef.current?.abort();
    const controller = new AbortController();
    recoveryAbortRef.current = controller;

    try {
      const response = await fetch(`/api/reviews?date=${job.date}`, {
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        review?: ReviewRecord | null;
      };

      if (!response.ok) {
        throw new Error(data.error || "检查失败");
      }

      // 请求回来时可能已经切日、卸载或开始了新的检查
      if (
        !mountedRef.current ||
        dateRef.current !== job.date ||
        recoveryCheckRef.current !== checkToken
      ) {
        return;
      }

      const review = data.review ?? null;

      if (review && generationMatchesReview(job, review)) {
        clearPersistedGeneration();
        onLoadReview(review);
        setRecoveryJob(null);
        toast.success("上次生成已经完成");
      } else {
        toast.info("还没查到生成结果，可以点“继续生成”");
      }
    } catch (error) {
      if (isAbortError(error)) return;
      if (!mountedRef.current || dateRef.current !== job.date) return;

      toast.error(error instanceof Error ? error.message : "检查失败");
    } finally {
      if (recoveryAbortRef.current === controller) {
        recoveryAbortRef.current = null;
      }
      if (recoveryCheckRef.current === checkToken) {
        recoveryCheckRef.current = null;
        if (mountedRef.current) setCheckingRecovery(false);
      }
    }
  }, [
    recoveryJob,
    checkingRecovery,
    mountedRef,
    dateRef,
    onLoadReview,
  ]);

  const handleRetryRecovery = useCallback(() => {
    const job = recoveryJob;
    // 检查进行中时不允许重试，避免两个流程同时改写草稿
    if (!job || loading || checkingRecovery || recoveryCheckRef.current) {
      return;
    }
    if (!mountedRef.current || dateRef.current !== job.date) return;

    // 校验通过后再改写草稿状态
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
  }, [
    recoveryJob,
    loading,
    checkingRecovery,
    mountedRef,
    dateRef,
    runQuestions,
    runFinal,
    setConversation,
    setRawInput,
    setRound,
    setStyle,
  ]);

  return {
    recoveryJob,
    checkingRecovery,
    runFinal,
    runQuestions,
    handleCheckRecovery,
    handleRetryRecovery,
  };
}
