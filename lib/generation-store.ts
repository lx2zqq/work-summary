import type {
  MemoryPromptItem,
  QAPair,
  ReviewDraft,
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
  round: number;
  conversationAfter: QAPair[];
  result?: GenerationResult;
  savedAt?: string | null;
  saveFailed?: boolean;
  error?: string;
};

type BeginInput = {
  date: string;
  mode: GenerationMode;
  rawInput: string;
  style: ReviewStyle;
  round: number;
  conversationAfter: QAPair[];
};

let activeJob: GenerationJob | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setJob(next: GenerationJob | null) {
  activeJob = next;
  emit();
}

function updateJob(id: string, patch: Partial<GenerationJob>) {
  if (!activeJob || activeJob.id !== id) return;
  setJob({ ...activeJob, ...patch });
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
    round: input.round,
    conversationAfter: input.conversationAfter,
  };

  setJob(job);
  return job;
}

/** 生成结果已拿到，正在保存；重新进入页面时仍显示等待状态 */
export function updateGenerationResult(
  id: string,
  result: GenerationResult,
): void {
  updateJob(id, { result, status: "saving" });
}

export function markGenerationSaved(id: string, savedAt: string): void {
  updateJob(id, {
    status: "done",
    savedAt,
    saveFailed: false,
    finishedAt: Date.now(),
  });
}

/** 生成成功但保存失败，重新进入时仍应用结果，并提示手动保存 */
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

function createJobId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
