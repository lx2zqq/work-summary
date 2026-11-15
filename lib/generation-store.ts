import type {
  MemoryPromptItem,
  QAPair,
  ReviewDraft,
  ReviewRecord,
  ReviewStyle,
} from "./types";

export type GenerationMode = "questions" | "final" | "restyle";
export type GenerationStatus = "loading" | "saving" | "done" | "error";

export type GenerationResult = {
  draft: ReviewDraft;
  fallback: boolean;
  warning?: string;
  memories: MemoryPromptItem[];
  /** 没有实际覆盖正文时（例如兜底失败），只提示不应用 */
  ignored?: boolean;
};

export type GenerationJob = {
  id: string;
  date: string;
  mode: GenerationMode;
  status: GenerationStatus;
  startedAt: number;
  finishedAt?: number;
  rawInput: string;
  style: ReviewStyle;
  answers: QAPair[];
  round: number;
  conversationAfter: QAPair[];
  /** 发起生成前，这篇复盘最后一次保存的时间，用于刷新后判断是否已落库 */
  baselineSavedAt: string | null;
  result?: GenerationResult;
  /** 生成结果的指纹，用于刷新后和数据库里的复盘比对 */
  signature?: string;
  savedAt?: string | null;
  saveFailed?: boolean;
  error?: string;
};

type BeginInput = {
  date: string;
  mode: GenerationMode;
  rawInput: string;
  style: ReviewStyle;
  answers: QAPair[];
  round: number;
  conversationAfter: QAPair[];
  baselineSavedAt: string | null;
};

const STORAGE_KEY = "work-summary:generation-job-v1";

let activeJob: GenerationJob | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function persistJob(job: GenerationJob | null) {
  if (!isBrowser()) return;

  try {
    if (!job) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(job));
  } catch {
    // 浏览器禁用存储时只保留内存状态
  }
}

function setJob(
  next: GenerationJob | null,
  options: { persist?: boolean } = {},
) {
  activeJob = next;
  if (options.persist !== false) persistJob(next);
  emit();
}

function updateJob(
  id: string,
  patch: Partial<GenerationJob>,
  options: { persist?: boolean } = {},
): boolean {
  if (!activeJob || activeJob.id !== id) return false;
  setJob({ ...activeJob, ...patch }, options);
  return true;
}

export function subscribeGeneration(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getGenerationJob(): GenerationJob | null {
  return activeJob;
}

export function getGenerationServerSnapshot(): null {
  return null;
}

export function beginGeneration(input: BeginInput): GenerationJob {
  const job: GenerationJob = {
    id: createJobId(),
    date: input.date,
    mode: input.mode,
    status: "loading",
    startedAt: Date.now(),
    rawInput: input.rawInput,
    style: input.style,
    answers: input.answers,
    round: input.round,
    conversationAfter: input.conversationAfter,
    baselineSavedAt: input.baselineSavedAt,
  };

  setJob(job);
  return job;
}

/** 生成结果已拿到，正在保存；重新进入页面时仍显示等待状态 */
export function updateGenerationResult(
  id: string,
  result: GenerationResult,
): void {
  if (!activeJob || activeJob.id !== id) return;

  updateJob(id, {
    result,
    status: "saving",
    signature: generationSignature({
      draft: result.draft,
      style: activeJob.style,
      conversation: activeJob.conversationAfter,
      round: activeJob.round,
    }),
  });
}

export function markGenerationSaved(id: string, savedAt: string): void {
  const applied = updateJob(
    id,
    {
      status: "done",
      savedAt,
      saveFailed: false,
      finishedAt: Date.now(),
    },
    { persist: false },
  );

  // 只有当前任务保存成功才清掉持久化标记，避免误清新任务
  if (applied) clearPersistedGeneration();
}

/** 生成成功但保存失败，刷新后仍可恢复结果并重新保存 */
export function markGenerationSaveFailed(id: string): void {
  updateJob(id, {
    status: "done",
    savedAt: null,
    saveFailed: true,
    finishedAt: Date.now(),
  });
}

export function failGeneration(id: string, error: string): void {
  updateJob(id, {
    status: "error",
    error,
    finishedAt: Date.now(),
  });
}

/** 只清指定任务；不传 id 时强制清空 */
export function clearGeneration(id?: string): void {
  if (id && activeJob?.id !== id) return;
  setJob(null);
}

/** 退出登录或测试时彻底清空 */
export function resetGenerationStore(): void {
  setJob(null);
}

export function readPersistedGeneration(): GenerationJob | null {
  if (!isBrowser()) return null;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as GenerationJob;
    if (!parsed || typeof parsed.id !== "string" || typeof parsed.date !== "string") {
      return null;
    }

    return {
      ...parsed,
      answers: Array.isArray(parsed.answers) ? parsed.answers : [],
      conversationAfter: Array.isArray(parsed.conversationAfter)
        ? parsed.conversationAfter
        : [],
      baselineSavedAt: parsed.baselineSavedAt ?? null,
    };
  } catch {
    return null;
  }
}

export function clearPersistedGeneration(): void {
  persistJob(null);
}

/**
 * 生成结果指纹。刷新后把数据库里的复盘按同样方式算一遍，
 * 就能判断那次生成到底有没有保存成功。
 */
export function generationSignature(input: {
  draft: ReviewDraft;
  style: ReviewStyle;
  conversation: QAPair[];
  round: number;
}): string {
  return JSON.stringify({
    sections: input.draft.sections,
    questions: input.draft.questions,
    dailyPhrase: input.draft.dailyPhrase ?? "",
    style: input.style,
    conversation: input.conversation,
    round: input.round,
  });
}

export function generationMatchesReview(
  job: GenerationJob,
  review: ReviewRecord,
): boolean {
  if (job.signature) {
    return (
      generationSignature({
        draft: review.draft,
        style: review.style,
        conversation: review.conversation,
        round: review.round,
      }) === job.signature
    );
  }

  // 刷新时结果还没拿到，没有指纹；用轮次和问答记录判断是否已保存
  return (
    review.round === job.round &&
    JSON.stringify(review.conversation) ===
      JSON.stringify(job.conversationAfter) &&
    review.updatedAt !== job.baselineSavedAt
  );
}

function createJobId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
