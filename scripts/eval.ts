import "./load-env";

import fs from "node:fs";
import path from "node:path";
import { generateDraftWithUsage } from "@/lib/ai/deepseek";
import { buildPromptMessages, PROMPT_VERSION } from "@/lib/ai/prompt";
import { percentile } from "@/lib/analytics/stats";
import {
  EVAL_CASES,
  buildEvalContext,
  buildEvalToolDeps,
  validateCase,
  type EvalCase,
} from "@/eval/cases";
import { pickDailyPhrases } from "@/lib/daily-phrase";
import { normalizeDraft } from "@/lib/draft";
import { runChecks, type CheckResult } from "@/lib/eval/checks";
import { judgeDraft, type JudgeScore } from "@/lib/eval/judge";
import { renderReview } from "@/lib/template";
import {
  DEFAULT_SETTINGS,
  emptyDraft,
  type AppSettings,
  type ReviewDraft,
} from "@/lib/types";

type CaseStatus = "passed" | "failed" | "error";

type CaseResult = {
  id: string;
  tags: string[];
  status: CaseStatus;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  toolCallNames: string[];
  toolRounds: number;
  degraded: boolean;
  checks: CheckResult[];
  judge?: JudgeScore;
  judgeError?: string;
  error?: string;
};

type Summary = {
  total: number;
  passed: number;
  failed: number;
  errors: number;
  passRate: number;
  avgDurationMs: number | null;
  p95DurationMs: number | null;
  avgPromptTokens: number | null;
  avgCompletionTokens: number | null;
  avgToolCalls: number | null;
  toolCallRate: number;
  degradedCount: number;
};

const args = process.argv.slice(2);

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

function readArg(name: string, fallback = ""): string {
  const prefix = `--${name}=`;
  return (
    args.find((value) => value.startsWith(prefix))?.slice(prefix.length) ??
    fallback
  );
}

function readNumberArg(name: string, fallback: number): number {
  const value = Number(readArg(name, String(fallback)));
  return Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : fallback;
}

function average(values: number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function writeFile(outDir: string, name: string, content: string): void {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, name), content, "utf8");
}

function checkTemplate(): string[] {
  const issues: string[] = [];
  const settings: AppSettings = { ...DEFAULT_SETTINGS };
  const draft: ReviewDraft = {
    ...emptyDraft(),
    sections: {
      ...emptyDraft().sections,
      xueqing: ["林小满：完成今日校内作业，错题已讲解。"],
      jiaoxiao: ["林小满妈妈（微信）：沟通今日作业完成情况。"],
      richang: ["服务再细致一些。"],
      xiaocheng: ["林小满的数学错题已录入小橙AI系统。"],
      jiaoyan: ["参加学管部教研。"],
    },
  };

  const text = renderReview(draft, "2026-11-15", settings);
  if (!text.startsWith("学管部工作复盘⬇️")) issues.push("标题应固定");
  if (!text.includes("2026年11月15日工作复盘")) issues.push("日期应正确");
  if (!text.includes("🍊【学情跟进】")) issues.push("应包含学情跟进");
  if (!text.includes("🍊【业绩跟踪】")) issues.push("空栏目也应保留");
  if (text.includes("🍊【工作困难】")) issues.push("工作困难默认关闭");
  if (!text.includes("🍊【教研相关】")) issues.push("教研相关应显示");

  const withKunnan = renderReview(draft, "2026-11-15", {
    ...settings,
    showKunnan: true,
    showFixedPhrase: true,
  });
  if (!withKunnan.includes("🍊【工作困难】")) {
    issues.push("开启后应显示工作困难");
  }
  if (
    !withKunnan.includes("目前没有困难，有困难都已经想办法解决。")
  ) {
    issues.push("无困难时应写标准句");
  }
  for (const phrase of pickDailyPhrases("2026-11-15", draft, 3)) {
    if (!withKunnan.includes(phrase)) {
      issues.push("开启通用话术后应自动补 3 条");
      break;
    }
  }

  const normalized = normalizeDraft({
    sections: {
      xueqing: ["1️⃣ 林小满：完成作业。", "林小满：完成作业。"],
      jiaoxiao: [],
      yeji: [],
      richang: [],
      xiaocheng: ["林小满：完成作业。"],
      kunnan: [],
      jiaoyan: [],
    },
    questions: [
      { text: "问题1", options: ["没有", "有"] },
      { text: "问题2", options: ["微信", "电话"] },
      { text: "问题3", options: [] },
      { text: "问题4", options: [] },
    ],
  });

  if (normalized.sections.xueqing.length !== 1) {
    issues.push("重复条目应去重");
  }
  if (normalized.questions.length !== 3) {
    issues.push("追问最多 3 条");
  }

  return issues;
}

function checkPrompts(
  cases: EvalCase[],
): Array<{ id: string; issues: string[] }> {
  return cases.map((item) => {
    const issues: string[] = [];
    const prompt = buildPromptMessages(buildEvalContext(item))
      .map((message) => message.content)
      .join("\n\n");

    // 改文风只带当前草稿，不带流水账，这是刻意设计
    if (item.mode !== "restyle" && !prompt.includes(item.rawInput)) {
      issues.push("prompt 缺少流水账");
    }

    const usesTools = item.mode !== "restyle";
    // 工具模式下学生和记忆不再进 prompt，但必须能通过工具查到
    const background = [
      ...(item.studentNames ?? []),
      ...(item.memories ?? []).map((memory) =>
        `${memory.studentName ?? ""} ${memory.content}`,
      ),
    ].join("\n");

    for (const value of item.promptIncludes ?? []) {
      if (prompt.includes(value)) continue;
      if (usesTools && background.includes(value)) continue;
      issues.push(`prompt 缺少“${value}”`);
    }

    if (usesTools && !prompt.includes("【可用工具】")) {
      issues.push("工具模式缺少工具说明");
    }

    if (
      item.mode === "questions" &&
      !prompt.includes("只输出 questions")
    ) {
      issues.push("questions 提示词不完整");
    }
    if (
      item.mode === "final" &&
      !prompt.includes("输出完整的 sections")
    ) {
      issues.push("final 提示词不完整");
    }
    if (item.mode === "restyle" && !prompt.includes("只改文风")) {
      issues.push("restyle 提示词不完整");
    }

    // 工具模式下名单由 search_students 提供，不再要求出现在 prompt 里
    if (!usesTools) {
      for (const name of item.studentNames ?? []) {
        if (!prompt.includes(name)) {
          issues.push(`prompt 缺少学生“${name}”`);
        }
      }
    }

    return { id: item.id, issues };
  });
}

function runOffline(cases: EvalCase[], outDir: string): number {
  const prompts = checkPrompts(cases).filter(
    (entry) => entry.issues.length > 0,
  );
  const template = checkTemplate();

  console.log(`\nPrompt 组装检查：${cases.length} 条`);
  if (prompts.length === 0) {
    console.log("✓ Prompt 通过");
  }
  for (const entry of prompts) {
    console.error(`✗ ${entry.id}：${entry.issues.join("；")}`);
  }

  console.log("\n模板与草稿检查：");
  if (template.length === 0) {
    console.log("✓ 模板通过");
  }
  for (const issue of template) {
    console.error(`✗ ${issue}`);
  }

  const failed = prompts.length + template.length;
  console.log(
    failed === 0
      ? "\n✓ 离线评测全部通过"
      : `\n✗ 离线评测失败 ${failed} 项`,
  );

  const report = {
    generatedAt: new Date().toISOString(),
    promptVersion: PROMPT_VERSION,
    mode: "offline",
    caseCount: cases.length,
    failed,
    prompts,
    template,
  };

  writeFile(outDir, "report.json", JSON.stringify(report, null, 2));
  writeFile(
    outDir,
    "report.md",
    [
      "# Work-Summary Eval Report",
      "",
      `- 模式：offline`,
      `- Prompt 版本：${PROMPT_VERSION}`,
      `- 用例数：${cases.length}`,
      `- 失败项：${failed}`,
    ].join("\n"),
  );

  return failed === 0 ? 0 : 1;
}

function summarize(results: CaseResult[]): Summary {
  const passed = results.filter(
    (result) => result.status === "passed",
  ).length;
  const failed = results.filter(
    (result) => result.status === "failed",
  ).length;
  const errors = results.filter(
    (result) => result.status === "error",
  ).length;

  const durations = results.map((result) => result.durationMs);
  const promptTokens = results
    .filter((result) => result.promptTokens > 0)
    .map((result) => result.promptTokens);
  const completionTokens = results
    .filter((result) => result.completionTokens > 0)
    .map((result) => result.completionTokens);

  const withToolCalls = results.filter(
    (result) => result.toolCallNames.length > 0,
  ).length;

  return {
    total: results.length,
    passed,
    failed,
    errors,
    passRate: results.length === 0 ? 0 : passed / results.length,
    avgDurationMs: average(durations),
    p95DurationMs: percentile(durations, 0.95),
    avgPromptTokens: average(promptTokens),
    avgCompletionTokens: average(completionTokens),
    avgToolCalls: average(
      results.map((result) => result.toolCallNames.length),
    ),
    toolCallRate: results.length === 0 ? 0 : withToolCalls / results.length,
    degradedCount: results.filter((result) => result.degraded).length,
  };
}

function summarizeByTag(
  results: CaseResult[],
): Array<{ tag: string; total: number; passed: number }> {
  const tags = Array.from(
    new Set(results.flatMap((result) => result.tags)),
  ).sort();

  return tags.map((tag) => {
    const items = results.filter((result) =>
      result.tags.includes(tag),
    );
    return {
      tag,
      total: items.length,
      passed: items.filter(
        (result) => result.status === "passed",
      ).length,
    };
  });
}

function formatAiReport(report: {
  generatedAt: string;
  promptVersion: string;
  caseCount: number;
  summary: Summary;
  byTag: Array<{ tag: string; total: number; passed: number }>;
  results: CaseResult[];
}): string {
  const { summary } = report;
  const lines = [
    "# Work-Summary Eval Report",
    "",
    `- 生成时间：${report.generatedAt}`,
    `- Prompt 版本：${report.promptVersion}`,
    `- 用例数：${report.caseCount}`,
    "",
    "## 汇总",
    "",
    "| 指标 | 数值 |",
    "| --- | --- |",
    `| 通过 / 失败 / 错误 | ${summary.passed} / ${summary.failed} / ${summary.errors} |`,
    `| 通过率 | ${(summary.passRate * 100).toFixed(1)}% |`,
    `| 平均耗时 | ${summary.avgDurationMs?.toFixed(0) ?? "—"} ms |`,
    `| P95 耗时 | ${summary.p95DurationMs?.toFixed(0) ?? "—"} ms |`,
    `| 平均 prompt tokens | ${summary.avgPromptTokens?.toFixed(0) ?? "—"} |`,
    `| 平均 completion tokens | ${summary.avgCompletionTokens?.toFixed(0) ?? "—"} |`,
    `| 平均工具调用次数 | ${summary.avgToolCalls?.toFixed(2) ?? "—"} |`,
    `| 发生过工具调用的用例 | ${(summary.toolCallRate * 100).toFixed(0)}% |`,
    `| 降级次数 | ${summary.degradedCount} |`,
    "",
    "## 分类",
    "",
    "| 标签 | 通过 / 总数 |",
    "| --- | --- |",
    ...report.byTag.map(
      (item) => `| ${item.tag} | ${item.passed} / ${item.total} |`,
    ),
    "",
    "## 明细",
  ];

  for (const result of report.results) {
    lines.push("", `### ${result.id} — ${result.status}`);
    if (result.error) {
      lines.push(`- 错误：${result.error}`);
    }
    for (const check of result.checks.filter(
      (item) => !item.passed,
    )) {
      lines.push(`- ${check.name}：${check.detail}`);
    }
    if (result.judge) {
      lines.push(
        `- judge：事实 ${result.judge.factuality}/2，完整 ${result.judge.completeness}/2，可用 ${result.judge.usability}/2`,
      );
      lines.push(`- judge 理由：${result.judge.reason}`);
    }
    if (result.judgeError) {
      lines.push(`- judge 失败：${result.judgeError}`);
    }
  }

  return lines.join("\n");
}

function compareBaseline(
  report: {
    summary: Summary;
  },
  baselinePath: string,
): string {
  if (!baselinePath || !fs.existsSync(baselinePath)) return "";

  try {
    const baseline = JSON.parse(
      fs.readFileSync(baselinePath, "utf8"),
    ) as { summary?: { passRate?: number } };
    const baseRate = baseline.summary?.passRate;

    if (typeof baseRate !== "number") return "";

    const delta = (report.summary.passRate - baseRate) * 100;
    return [
      "",
      "## 与基线对比",
      "",
      `- 基线通过率：${(baseRate * 100).toFixed(1)}%`,
      `- 本次变化：${delta >= 0 ? "+" : ""}${delta.toFixed(1)} 个百分点`,
    ].join("\n");
  } catch {
    return "";
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;

        if (index >= items.length) return;
        results[index] = await fn(items[index]);
      }
    },
  );

  await Promise.all(workers);
  return results;
}

async function runAi(
  cases: EvalCase[],
  outDir: string,
): Promise<number> {
  if (!process.env.REVIEW_DEEPSEEK_API_KEY?.trim()) {
    console.error(
      "未配置 REVIEW_DEEPSEEK_API_KEY，无法运行 AI 评测。先用 npm run eval 跑离线检查。",
    );
    return 1;
  }

  const useJudge = hasFlag("judge");
  const judgeLimit = readNumberArg("judge-limit", 10);
  const strict = hasFlag("strict");
  const judgeIds = new Set(
    cases
      .filter((item) => item.mode !== "questions")
      .slice(0, judgeLimit)
      .map((item) => item.id),
  );

  console.log(
    `\n开始 AI 评测：${cases.length} 条${useJudge ? `，judge 前 ${judgeLimit} 条` : ""}\n`,
  );

  const results = await mapWithConcurrency<EvalCase, CaseResult>(
    cases,
    2,
    async (item) => {
      const startedAt = Date.now();

      try {
        const { draft, usage, toolCallNames, toolRounds, degraded } =
          await generateDraftWithUsage(buildEvalContext(item), {
            toolDeps: buildEvalToolDeps(item),
          });

        const checks = runChecks({
          mode: item.mode,
          style: item.style,
          draft,
          expect: item.expect,
          rawInput: item.rawInput,
          answers: item.answers ?? [],
          beforeDraft: item.currentDraft,
          // 改文风不走工具，传 undefined 表示跳过工具检查
          toolCallNames: item.mode === "restyle" ? undefined : toolCallNames,
          studentNames: item.studentNames,
        });

        let judge: JudgeScore | undefined;
        let judgeError: string | undefined;

        if (useJudge && judgeIds.has(item.id)) {
          try {
            judge = await judgeDraft({
              rawInput: item.rawInput,
              draft,
            });
          } catch (error) {
            judgeError =
              error instanceof Error ? error.message : "judge 失败";
          }
        }

        return {
          id: item.id,
          tags: item.tags,
          status: checks.every((check) => check.passed)
            ? "passed"
            : "failed",
          durationMs: Date.now() - startedAt,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          toolCallNames,
          toolRounds,
          degraded,
          checks,
          judge,
          judgeError,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "未知错误";

        // 空输入时模型返回空正文，被 finalizeDraft 拦下。
        // 这是保护逻辑，不是评测失败，按通过处理并记录一条检查项。
        if (
          item.expect.allowEmpty &&
          message.includes("没有生成有效正文")
        ) {
          return {
            id: item.id,
            tags: item.tags,
            status: "passed",
            durationMs: Date.now() - startedAt,
            promptTokens: 0,
            completionTokens: 0,
            toolCallNames: [],
            toolRounds: 1,
            degraded: false,
            checks: [
              {
                name: "空输入保护",
                passed: true,
                detail: "模型没有编造正文",
              },
            ],
          };
        }

        return {
          id: item.id,
          tags: item.tags,
          status: "error",
          durationMs: Date.now() - startedAt,
          promptTokens: 0,
          completionTokens: 0,
          toolCallNames: [],
          toolRounds: 0,
          degraded: false,
          checks: [],
          error: message,
        };
      }
    },
  );

  const summary = summarize(results);
  const byTag = summarizeByTag(results);
  const report = {
    generatedAt: new Date().toISOString(),
    promptVersion: PROMPT_VERSION,
    caseCount: cases.length,
    summary,
    byTag,
    results,
  };

  const markdown =
    formatAiReport(report) +
    compareBaseline(report, readArg("baseline"));

  writeFile(outDir, "report.json", JSON.stringify(report, null, 2));
  writeFile(outDir, "report.md", markdown);
  console.log(markdown);

  return strict
    ? summary.failed + summary.errors > 0
      ? 1
      : 0
    : summary.errors > 0
      ? 1
      : 0;
}

async function main() {
  const tags = readArg("tags")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const limit = readNumberArg("limit", 0);

  let cases = EVAL_CASES.filter(
    (item) =>
      tags.length === 0 ||
      item.tags.some((tag) => tags.includes(tag)),
  );

  if (limit > 0) cases = cases.slice(0, limit);

  if (cases.length === 0) {
    console.error("没有匹配的用例");
    process.exit(1);
  }

  const validation = cases
    .map((item) => ({ id: item.id, issues: validateCase(item) }))
    .filter((entry) => entry.issues.length > 0);

  if (validation.length > 0) {
    console.error("数据集自检失败：");
    for (const entry of validation) {
      console.error(`✗ ${entry.id}：${entry.issues.join("；")}`);
    }
    process.exit(1);
  }

  const mode = readArg("mode", "offline");
  const outDir = readArg("out", "eval");
  const exitCode =
    mode === "ai"
      ? await runAi(cases, outDir)
      : runOffline(cases, outDir);

  process.exit(exitCode);
}

main().catch((error) => {
  console.error("评测失败：", error);
  process.exit(1);
});
