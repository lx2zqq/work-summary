import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginGeneration,
  clearGeneration,
  failGeneration,
  generationMatchesReview,
  getGenerationJob,
  markGenerationSaveFailed,
  markGenerationSaved,
  resetGenerationStore,
  subscribeGeneration,
  updateGenerationResult,
} from "@/lib/generation-store";
import {
  emptyDraft,
  type ReviewRecord,
} from "@/lib/types";

const BASE = {
  date: "2026-11-15",
  mode: "final" as const,
  rawInput: "今天林小满作业完成了。",
  style: "concise" as const,
  answers: [],
  round: 3,
  conversationAfter: [],
  baselineSavedAt: null,
};

beforeEach(() => {
  resetGenerationStore();
});

describe("generation store", () => {
  it("创建任务后进入 loading", () => {
    const job = beginGeneration(BASE);

    expect(job.status).toBe("loading");
    expect(job.mode).toBe("final");
    expect(job.rawInput).toBe(BASE.rawInput);
    expect(getGenerationJob()?.id).toBe(job.id);
  });

  it("生成结果先进入 saving，保存后进入 done", () => {
    const job = beginGeneration(BASE);

    updateGenerationResult(job.id, {
      draft: emptyDraft(),
      fallback: false,
      memories: [],
    });

    expect(getGenerationJob()?.status).toBe("saving");
    expect(getGenerationJob()?.result).toBeDefined();

    markGenerationSaved(job.id, "2026-11-15T10:00:00.000Z");

    expect(getGenerationJob()?.status).toBe("done");
    expect(getGenerationJob()?.savedAt).toBe(
      "2026-11-15T10:00:00.000Z",
    );
    expect(getGenerationJob()?.saveFailed).toBe(false);
  });

  it("保存失败时保留结果并标记 saveFailed", () => {
    const job = beginGeneration(BASE);

    updateGenerationResult(job.id, {
      draft: emptyDraft(),
      fallback: false,
      memories: [],
    });
    markGenerationSaveFailed(job.id);

    expect(getGenerationJob()?.status).toBe("done");
    expect(getGenerationJob()?.saveFailed).toBe(true);
    expect(getGenerationJob()?.savedAt).toBeNull();
    expect(getGenerationJob()?.result).toBeDefined();
  });

  it("请求失败时记录错误", () => {
    const job = beginGeneration(BASE);

    failGeneration(job.id, "AI 暂时不可用");

    expect(getGenerationJob()?.status).toBe("error");
    expect(getGenerationJob()?.error).toBe("AI 暂时不可用");
  });

  it("旧任务晚到的更新不会覆盖新任务", () => {
    const first = beginGeneration(BASE);
    const second = beginGeneration({
      ...BASE,
      mode: "questions",
      round: 0,
    });

    updateGenerationResult(first.id, {
      draft: emptyDraft(),
      fallback: false,
      memories: [],
    });
    failGeneration(first.id, "旧任务失败");

    expect(getGenerationJob()?.id).toBe(second.id);
    expect(getGenerationJob()?.status).toBe("loading");
    expect(getGenerationJob()?.result).toBeUndefined();
  });

  it("clear 只清匹配的任务", () => {
    const first = beginGeneration(BASE);
    const second = beginGeneration(BASE);

    clearGeneration(first.id);
    expect(getGenerationJob()?.id).toBe(second.id);

    clearGeneration(second.id);
    expect(getGenerationJob()).toBeNull();
  });

  it("生成结果指纹能和数据库里的复盘对上", () => {
    const job = beginGeneration(BASE);

    updateGenerationResult(job.id, {
      draft: emptyDraft(),
      fallback: false,
      memories: [],
    });

    const review: ReviewRecord = {
      id: "review-1",
      reviewDate: BASE.date,
      rawInput: BASE.rawInput,
      draft: emptyDraft(),
      finalText: "",
      style: BASE.style,
      conversation: [],
      round: BASE.round,
      memoryExtractedAt: null,
      updatedAt: "2026-11-15T10:00:00.000Z",
    };

    expect(generationMatchesReview(getGenerationJob()!, review)).toBe(true);

    expect(
      generationMatchesReview(getGenerationJob()!, {
        ...review,
        round: 2,
      }),
    ).toBe(false);
  });

  it("没有指纹时用轮次和问答记录判断是否已保存", () => {
    const job = beginGeneration({
      ...BASE,
      baselineSavedAt: "2026-11-15T09:00:00.000Z",
    });
    const review: ReviewRecord = {
      id: "review-1",
      reviewDate: BASE.date,
      rawInput: BASE.rawInput,
      draft: emptyDraft(),
      finalText: "",
      style: BASE.style,
      conversation: [],
      round: BASE.round,
      memoryExtractedAt: null,
      updatedAt: "2026-11-15T09:00:00.000Z",
    };

    expect(generationMatchesReview(job, review)).toBe(false);
    expect(
      generationMatchesReview(job, {
        ...review,
        updatedAt: "2026-11-15T10:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("订阅在状态变化时触发，取消后不再触发", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeGeneration(listener);

    const job = beginGeneration(BASE);
    expect(listener).toHaveBeenCalledTimes(1);

    updateGenerationResult(job.id, {
      draft: emptyDraft(),
      fallback: false,
      memories: [],
    });
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    markGenerationSaved(job.id, "2026-11-15T10:00:00.000Z");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
