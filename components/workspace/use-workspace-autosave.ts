"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { toast } from "sonner";
import { clearGeneration, getGenerationJob } from "@/lib/generation-store";
import {
  hasDraftContent,
  type QAPair,
  type ReviewDraft,
  type ReviewStyle,
} from "@/lib/types";
import type { SavePayload } from "./workspace-shared";

type Params = {
  date: string;
  rawInput: string;
  draft: ReviewDraft;
  style: ReviewStyle;
  conversation: QAPair[];
  round: number;
  loading: boolean;
  hydratedDate: string;
  initialSavedAt: string | null;
  /** 生成任务的 baseline 只认复盘自带时间，和界面展示的 savedAt 分开 */
  initialSavedAtRef: string | null;
  initialDirty: boolean;
  initialSaveFailed: boolean;
  initialArchived: boolean;
  activeJobIdRef: RefObject<string | null>;
};

/**
 * 工作台保存层：串行队列 + 1.6 秒防抖暂存 + 页面卸载补存。
 * 保存状态统一在这里维护，生成逻辑通过 setter 同步任务结果。
 */
export function useWorkspaceAutosave({
  date,
  rawInput,
  draft,
  style,
  conversation,
  round,
  loading,
  hydratedDate,
  initialSavedAt,
  initialSavedAtRef,
  initialDirty,
  initialSaveFailed,
  initialArchived,
  activeJobIdRef,
}: Params) {
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(initialSaveFailed);
  const [savedAt, setSavedAt] = useState<string | null>(initialSavedAt);
  const [dirty, setDirty] = useState(initialDirty);
  // 归档是 UI 状态：显式点「保存」后标记，后续有改动会回到自动暂存
  const [archived, setArchived] = useState(initialArchived);

  const savedAtRef = useRef<string | null>(initialSavedAtRef);
  const dateRef = useRef(date);
  const latestPayloadRef = useRef<SavePayload | null>(null);
  const dirtyRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const savingCountRef = useRef(0);
  const editRevisionRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    dateRef.current = date;
  }, [date]);

  const markDirty = useCallback(() => {
    editRevisionRef.current += 1;
    setDirty(true);
    setArchived(false);
  }, []);

  const persistReviewNow = useCallback(
    async (
      payload: SavePayload,
      options: { silent?: boolean },
      revision: number,
    ): Promise<boolean> => {
      // 清空内容属于有效编辑：不发请求，但要把 dirty 复位，
      // 否则自动保存会一直触发、状态永远停在“未保存”。
      if (!payload.rawInput.trim() && !hasDraftContent(payload.draft)) {
        if (mountedRef.current && editRevisionRef.current === revision) {
          setDirty(false);
          setSaveFailed(false);
        }
        return true;
      }

      const isLatest = () =>
        mountedRef.current &&
        editRevisionRef.current === revision &&
        dateRef.current === payload.date;

      savingCountRef.current += 1;
      if (mountedRef.current) setSaving(true);
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

        if (!mountedRef.current) return true;
        setSavedAt(nextSavedAt);

        // 请求期间用户可能又改了内容，或已经切到别的日期，
        // 只有版本和日期都没变化才能标记为已保存
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
        if (savingCountRef.current === 0 && mountedRef.current) {
          setSaving(false);
        }
      }
    },
    [activeJobIdRef],
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

  /**
   * 页面隐藏或卸载时的补存。
   * 普通 fetch 可能被浏览器取消，所以优先 sendBeacon，
   * 否则退回 keepalive 请求。
   */
  const flushWithKeepalive = useCallback(() => {
    if (!dirtyRef.current) return;

    const payload = latestPayloadRef.current;
    if (!payload) return;
    if (!payload.rawInput.trim() && !hasDraftContent(payload.draft)) return;

    // 有生成任务在跑时，结果和保存交给生成流程
    const job = getGenerationJob();
    if (
      job &&
      job.date === payload.date &&
      job.status !== "error" &&
      !job.saveFailed
    ) {
      return;
    }

    const body = JSON.stringify(payload);

    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon("/api/reviews", blob)) return;
    }

    void fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handlePageHide = () => flushWithKeepalive();
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flushWithKeepalive();
    };

    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [flushWithKeepalive]);

  // 组件卸载（路由切换）时再补一次
  useEffect(() => {
    return () => {
      flushWithKeepalive();
    };
  }, [flushWithKeepalive]);

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

  return {
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
  };
}
