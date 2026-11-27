import type { WeeklyReport } from "./types";

export type WeeklyGenerationStatus =
  | "idle"
  | "running"
  | "succeeded"
  | "failed";

export type WeeklyGenerationJob = {
  weekStart: string;
  status: Exclude<WeeklyGenerationStatus, "idle">;
  startedAt: number;
  finishedAt?: number;
  report?: WeeklyReport;
  error?: string;
};

type Listener = () => void;

const jobs = new Map<string, WeeklyGenerationJob>();
const promises = new Map<string, Promise<WeeklyReport | null>>();
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setJob(job: WeeklyGenerationJob): void {
  jobs.set(job.weekStart, job);
  emit();
}

export function subscribeWeeklyGeneration(
  listener: Listener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getWeeklyGenerationJob(
  weekStart: string,
): WeeklyGenerationJob | null {
  return jobs.get(weekStart) ?? null;
}

export function getWeeklyGenerationServerSnapshot(): null {
  return null;
}

export function getWeeklyGenerationStatus(
  weekStart: string,
): WeeklyGenerationStatus {
  return jobs.get(weekStart)?.status ?? "idle";
}

/**
 * 按 weekStart 去重启动后台生成。
 * 任务不绑定组件生命周期，Promise 结束后把结果留在 store 里等页面回来消费。
 */
export function startWeeklyGeneration(input: {
  weekStart: string;
  request: () => Promise<WeeklyReport>;
}): Promise<WeeklyReport | null> {
  const running = promises.get(input.weekStart);
  if (running) return running;

  const startedAt = Date.now();
  setJob({
    weekStart: input.weekStart,
    status: "running",
    startedAt,
  });

  let requestPromise: Promise<WeeklyReport>;

  try {
    requestPromise = Promise.resolve(input.request());
  } catch (error) {
    setJob({
      weekStart: input.weekStart,
      status: "failed",
      startedAt,
      finishedAt: Date.now(),
      error:
        error instanceof Error ? error.message : "生成周报失败",
    });
    return Promise.resolve(null);
  }

  const promise = requestPromise
    .then((report) => {
      setJob({
        weekStart: input.weekStart,
        status: "succeeded",
        startedAt,
        finishedAt: Date.now(),
        report,
      });
      return report;
    })
    .catch((error) => {
      setJob({
        weekStart: input.weekStart,
        status: "failed",
        startedAt,
        finishedAt: Date.now(),
        error:
          error instanceof Error ? error.message : "生成周报失败",
      });
      return null;
    });

  promises.set(input.weekStart, promise);
  void promise.finally(() => {
    if (promises.get(input.weekStart) === promise) {
      promises.delete(input.weekStart);
    }
  });

  return promise;
}

export function clearWeeklyGeneration(weekStart: string): void {
  if (!jobs.has(weekStart)) return;
  jobs.delete(weekStart);
  emit();
}

export function resetWeeklyGenerationStore(): void {
  jobs.clear();
  promises.clear();
  emit();
}
