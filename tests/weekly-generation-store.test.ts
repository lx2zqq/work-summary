import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearWeeklyGeneration,
  getWeeklyGenerationJob,
  getWeeklyGenerationStatus,
  resetWeeklyGenerationStore,
  startWeeklyGeneration,
  subscribeWeeklyGeneration,
} from "@/lib/weekly-generation-store";
import type { WeeklyReport } from "@/lib/types";

const WEEK = "2026-11-23";

function buildReport(): WeeklyReport {
  return {
    id: "report-1",
    weekStart: WEEK,
    weekEnd: "2026-11-29",
    content: {
      summary: { miantan: "面谈", weixin: "无" },
      metrics: {
        qingjia: "无",
        yujing: "无",
        tingke: "无",
        jieke: "无",
        kuoke: "无",
        xinqian: "无",
        xufei: "无",
        activeStudentsByGrade: "高一：1人\n合计：1人",
      },
      reflection: "暂无",
      nextWeek: { zhongdianHuifang: "无", jiazhanghui: "无" },
      supportNeeded: "暂无",
    },
    status: "draft",
    sourceReviewCount: 1,
    generatedAt: "2026-11-27T10:00:00.000Z",
    createdAt: "2026-11-27T10:00:00.000Z",
    updatedAt: "2026-11-27T10:00:00.000Z",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

beforeEach(() => {
  resetWeeklyGenerationStore();
});

describe("weekly-generation-store", () => {
  it("running 状态可被订阅，完成后保留结果", async () => {
    const task = deferred<WeeklyReport>();
    const request = vi.fn(() => task.promise);
    const listener = vi.fn();
    const unsubscribe = subscribeWeeklyGeneration(listener);

    const promise = startWeeklyGeneration({ weekStart: WEEK, request });

    expect(getWeeklyGenerationStatus(WEEK)).toBe("running");
    expect(getWeeklyGenerationJob(WEEK)?.status).toBe("running");
    expect(request).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalled();

    task.resolve(buildReport());
    await expect(promise).resolves.toMatchObject({ id: "report-1" });

    expect(getWeeklyGenerationStatus(WEEK)).toBe("succeeded");
    expect(getWeeklyGenerationJob(WEEK)?.report?.id).toBe("report-1");
    unsubscribe();
  });

  it("同一周重复启动会复用同一个 Promise", async () => {
    const task = deferred<WeeklyReport>();
    const request = vi.fn(() => task.promise);

    const first = startWeeklyGeneration({ weekStart: WEEK, request });
    const second = startWeeklyGeneration({ weekStart: WEEK, request });

    expect(first).toBe(second);
    expect(request).toHaveBeenCalledTimes(1);

    task.resolve(buildReport());
    await Promise.all([first, second]);
  });

  it("失败时记录错误并返回 null，不抛未处理异常", async () => {
    const task = deferred<WeeklyReport>();
    const request = vi.fn(() => task.promise);

    const promise = startWeeklyGeneration({ weekStart: WEEK, request });
    task.reject(new Error("模型超时"));

    await expect(promise).resolves.toBeNull();
    expect(getWeeklyGenerationStatus(WEEK)).toBe("failed");
    expect(getWeeklyGenerationJob(WEEK)?.error).toBe("模型超时");
  });

  it("同步抛错时也能记录失败状态", async () => {
    const promise = startWeeklyGeneration({
      weekStart: WEEK,
      request: () => {
        throw new Error("请求构造失败");
      },
    });

    await expect(promise).resolves.toBeNull();
    expect(getWeeklyGenerationStatus(WEEK)).toBe("failed");
    expect(getWeeklyGenerationJob(WEEK)?.error).toBe(
      "请求构造失败",
    );
  });

  it("完成后可以清空，状态回到 idle", async () => {
    const promise = startWeeklyGeneration({
      weekStart: WEEK,
      request: async () => buildReport(),
    });
    await promise;

    clearWeeklyGeneration(WEEK);

    expect(getWeeklyGenerationStatus(WEEK)).toBe("idle");
    expect(getWeeklyGenerationJob(WEEK)).toBeNull();
  });

  it("完成后再次启动会发起新任务", async () => {
    const firstRequest = vi.fn(async () => buildReport());
    await startWeeklyGeneration({
      weekStart: WEEK,
      request: firstRequest,
    });

    const secondRequest = vi.fn(async () => buildReport());
    await startWeeklyGeneration({
      weekStart: WEEK,
      request: secondRequest,
    });

    expect(firstRequest).toHaveBeenCalledTimes(1);
    expect(secondRequest).toHaveBeenCalledTimes(1);
  });
});
