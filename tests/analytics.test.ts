import { describe, expect, it } from "vitest";
import {
  formatStatsMarkdown,
  percentile,
  summarizeEvents,
  type StatsEvent,
} from "@/lib/analytics/stats";

function event(
  name: string,
  createdAt: string,
  properties: Record<string, unknown> = {},
  reviewDate: string | null = "2026-11-13",
): StatsEvent {
  return { event: name, reviewDate, properties, createdAt };
}

const EVENTS: StatsEvent[] = [
  event("generate_started", "2026-11-13T01:00:00.000Z", {
    mode: "questions",
    memoryCount: 2,
  }),
  event("generate_finished", "2026-11-13T01:00:01.000Z", {
    mode: "questions",
    durationMs: 1000,
    promptTokens: 100,
    completionTokens: 50,
    retried: false,
  }),
  event("question_answered", "2026-11-13T01:01:00.000Z", {
    round: 0,
    questionCount: 3,
    answeredCount: 2,
    skipped: false,
  }),
  event("question_answered", "2026-11-13T01:02:00.000Z", {
    round: 1,
    questionCount: 3,
    answeredCount: 0,
    skipped: true,
  }),
  event("generate_started", "2026-11-13T02:00:00.000Z", {
    mode: "final",
    memoryCount: 0,
  }),
  event("generate_finished", "2026-11-13T02:00:02.000Z", {
    mode: "final",
    durationMs: 2000,
    promptTokens: 200,
    completionTokens: 100,
    retried: true,
    itemCount: 4,
    charCount: 400,
  }),
  event("review_saved", "2026-11-13T02:05:00.000Z", {
    itemCount: 5,
    charCount: 500,
  }),
  event("review_copied", "2026-11-13T02:06:00.000Z", {
    itemCount: 5,
    charCount: 500,
  }),
  event(
    "generate_started",
    "2026-11-12T03:00:00.000Z",
    { mode: "final", memoryCount: 1 },
    "2026-11-12",
  ),
  event(
    "generate_finished",
    "2026-11-12T03:00:03.000Z",
    {
      mode: "final",
      durationMs: 3000,
      promptTokens: 300,
      completionTokens: 150,
      retried: false,
      itemCount: 2,
      charCount: 200,
    },
    "2026-11-12",
  ),
  event(
    "generate_failed",
    "2026-11-12T04:00:00.000Z",
    { mode: "final", durationMs: 500, errorKind: "request" },
    "2026-11-12",
  ),
  event(
    "memory_extracted",
    "2026-11-13T02:10:00.000Z",
    { created: 2, updated: 1, durationMs: 800 },
    "2026-11-13",
  ),
];

describe("percentile", () => {
  it("按 nearest-rank 计算 P50 / P95", () => {
    expect(percentile([1000, 2000, 3000], 0.5)).toBe(2000);
    expect(percentile([1000, 2000, 3000], 0.95)).toBe(3000);
    expect(percentile([], 0.5)).toBeNull();
  });
});

describe("summarizeEvents", () => {
  const summary = summarizeEvents(EVENTS);

  it("统计生成成功率和首次通过率", () => {
    expect(summary.generateStarted).toBe(3);
    expect(summary.generateFinished).toBe(3);
    expect(summary.generateFailed).toBe(1);
    expect(summary.successRate).toBeCloseTo(0.75);
    expect(summary.firstPassRate).toBeCloseTo(2 / 3);
  });

  it("统计延迟和 token", () => {
    expect(summary.p50DurationMs).toBe(2000);
    expect(summary.p95DurationMs).toBe(3000);
    expect(summary.avgPromptTokens).toBe(200);
    expect(summary.avgCompletionTokens).toBe(100);
  });

  it("统计追问回答率", () => {
    expect(summary.followUpTotal).toBe(2);
    expect(summary.followUpSkipped).toBe(1);
    expect(summary.followUpAnswerRate).toBe(0.5);
  });

  it("统计复制率和编辑改动", () => {
    expect(summary.copyRate).toBe(0.5);
    expect(summary.avgItemDelta).toBe(1);
    expect(summary.avgCharDelta).toBe(100);
  });

  it("统计记忆注入率", () => {
    expect(summary.memoryHitRate).toBeCloseTo(2 / 3);
    expect(summary.memoryExtractions).toBe(1);
  });

  it("活跃天数按 review_date 去重", () => {
    expect(summary.activeDays).toBe(2);
  });

  it("空数据不报错", () => {
    const empty = summarizeEvents([]);
    expect(empty.eventCount).toBe(0);
    expect(empty.successRate).toBe(0);
    expect(empty.p95DurationMs).toBeNull();
    expect(empty.avgItemDelta).toBeNull();
  });
});

describe("formatStatsMarkdown", () => {
  it("输出关键指标", () => {
    const text = formatStatsMarkdown(summarizeEvents(EVENTS));
    expect(text).toContain("生成成功率");
    expect(text).toContain("75.0%");
    expect(text).toContain("2000 ms");
  });
});
