// 纯函数统计，不依赖数据库，方便单测和 scripts/stats.ts 复用

export type StatsEvent = {
  event: string;
  reviewDate: string | null;
  properties: Record<string, unknown>;
  createdAt: string;
};

export type StatsSummary = {
  eventCount: number;
  activeDays: number;
  generateStarted: number;
  generateFinished: number;
  generateFailed: number;
  successRate: number;
  firstPassRate: number;
  p50DurationMs: number | null;
  p95DurationMs: number | null;
  avgPromptTokens: number | null;
  avgCompletionTokens: number | null;
  followUpTotal: number;
  followUpSkipped: number;
  followUpAnswerRate: number;
  copyRate: number;
  avgItemDelta: number | null;
  avgCharDelta: number | null;
  /** 生成时带上记忆的请求比例；不代表记忆一定被采纳 */
  memoryHitRate: number;
  memoryExtractions: number;
};

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

/** nearest-rank 百分位，数据量小时也稳定 */
export function percentile(
  values: number[],
  p: number,
): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(p * sorted.length);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, rank - 1),
  );

  return sorted[index];
}

export function summarizeEvents(input: StatsEvent[]): StatsSummary {
  const events = [...input].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );

  const started = events.filter(
    (event) => event.event === "generate_started",
  );
  const finished = events.filter(
    (event) => event.event === "generate_finished",
  );
  const failed = events.filter(
    (event) => event.event === "generate_failed",
  );
  const finalFinished = finished.filter(
    (event) => event.properties.mode === "final",
  );
  const saved = events.filter(
    (event) => event.event === "review_saved",
  );
  const copied = events.filter(
    (event) => event.event === "review_copied",
  );
  const answered = events.filter(
    (event) => event.event === "question_answered",
  );
  const memory = events.filter(
    (event) => event.event === "memory_extracted",
  );

  const durations = finished
    .map((event) => toNumber(event.properties.durationMs))
    .filter((value): value is number => value !== null);

  const promptTokens = finished
    .map((event) => toNumber(event.properties.promptTokens))
    .filter((value): value is number => value !== null);
  const completionTokens = finished
    .map((event) => toNumber(event.properties.completionTokens))
    .filter((value): value is number => value !== null);

  const activeDays = new Set(
    events
      .map((event) => event.reviewDate)
      .filter((value): value is string => Boolean(value)),
  ).size;

  const finalDays = new Set(
    finalFinished
      .map((event) => event.reviewDate)
      .filter((value): value is string => Boolean(value)),
  );
  const copiedDays = new Set(
    copied
      .map((event) => event.reviewDate)
      .filter((value): value is string => Boolean(value)),
  );

  const followUpSkipped = answered.filter(
    (event) => event.properties.skipped === true,
  ).length;

  const memoryStarts = started.filter(
    (event) => (toNumber(event.properties.memoryCount) ?? 0) > 0,
  ).length;

  // 同一天可能重新生成多次：取最后一次最终稿和最后一次保存做对比
  const finalByDate = new Map<string, StatsEvent>();
  for (const event of finalFinished) {
    if (event.reviewDate) finalByDate.set(event.reviewDate, event);
  }

  const savedByDate = new Map<string, StatsEvent>();
  for (const event of saved) {
    if (event.reviewDate) savedByDate.set(event.reviewDate, event);
  }

  const itemDeltas: number[] = [];
  const charDeltas: number[] = [];

  for (const [date, generated] of finalByDate) {
    const savedEvent = savedByDate.get(date);
    if (!savedEvent) continue;

    const generatedItems = toNumber(generated.properties.itemCount);
    const savedItems = toNumber(savedEvent.properties.itemCount);
    const generatedChars = toNumber(generated.properties.charCount);
    const savedChars = toNumber(savedEvent.properties.charCount);

    if (generatedItems !== null && savedItems !== null) {
      itemDeltas.push(Math.abs(savedItems - generatedItems));
    }
    if (generatedChars !== null && savedChars !== null) {
      charDeltas.push(Math.abs(savedChars - generatedChars));
    }
  }

  return {
    eventCount: events.length,
    activeDays,
    generateStarted: started.length,
    generateFinished: finished.length,
    generateFailed: failed.length,
    successRate: ratio(finished.length, finished.length + failed.length),
    firstPassRate: ratio(
      finished.filter((event) => event.properties.retried !== true).length,
      finished.length,
    ),
    p50DurationMs: percentile(durations, 0.5),
    p95DurationMs: percentile(durations, 0.95),
    avgPromptTokens: average(promptTokens),
    avgCompletionTokens: average(completionTokens),
    followUpTotal: answered.length,
    followUpSkipped,
    followUpAnswerRate: ratio(
      answered.length - followUpSkipped,
      answered.length,
    ),
    copyRate: ratio(copiedDays.size, finalDays.size),
    avgItemDelta: average(itemDeltas),
    avgCharDelta: average(charDeltas),
    memoryHitRate: ratio(memoryStarts, started.length),
    memoryExtractions: memory.length,
  };
}

export function formatStatsMarkdown(
  summary: StatsSummary,
): string {
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
  const milliseconds = (value: number | null) =>
    value === null ? "—" : `${Math.round(value)} ms`;
  const number = (value: number | null, digits = 1) =>
    value === null ? "—" : value.toFixed(digits);

  return [
    "| 指标 | 数值 |",
    "| --- | --- |",
    `| 事件数 | ${summary.eventCount} |`,
    `| 活跃天数 | ${summary.activeDays} |`,
    `| 生成请求 | ${summary.generateStarted} |`,
    `| 生成成功 / 失败 | ${summary.generateFinished} / ${summary.generateFailed} |`,
    `| 生成成功率 | ${percent(summary.successRate)} |`,
    `| 首次输出通过率 | ${percent(summary.firstPassRate)} |`,
    `| 延迟 P50 / P95 | ${milliseconds(summary.p50DurationMs)} / ${milliseconds(summary.p95DurationMs)} |`,
    `| 平均 prompt / completion tokens | ${number(summary.avgPromptTokens, 0)} / ${number(summary.avgCompletionTokens, 0)} |`,
    `| 追问提交次数 | ${summary.followUpTotal} |`,
    `| 追问回答率 | ${percent(summary.followUpAnswerRate)} |`,
    `| 复制率（按天） | ${percent(summary.copyRate)} |`,
    `| 平均条目改动数 | ${number(summary.avgItemDelta)} |`,
    `| 平均字数改动 | ${number(summary.avgCharDelta, 0)} |`,
    `| 记忆注入率 | ${percent(summary.memoryHitRate)} |`,
    `| 记忆提取次数 | ${summary.memoryExtractions} |`,
  ].join("\n");
}
