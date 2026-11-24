import { describe, expect, it } from "vitest";
import {
  EVAL_CASES,
  validateCase,
  type EvalCase,
} from "@/eval/cases";
import {
  countItems,
  runChecks,
  type CheckInput,
} from "@/lib/eval/checks";
import {
  emptySections,
  type ReviewDraft,
  type SectionKey,
} from "@/lib/types";

function draft(
  sections: Partial<Record<SectionKey, string[]>>,
  extra: Partial<ReviewDraft> = {},
): ReviewDraft {
  return {
    sections: { ...emptySections(), ...sections },
    questions: [],
    notes: [],
    ...extra,
  };
}

function input(overrides: Partial<CheckInput> = {}): CheckInput {
  return {
    mode: "final",
    style: "concise",
    draft: draft({
      xueqing: ["林小满：完成今日作业，错题已讲解。"],
      richang: [
        "今天主要跟进了林小满的作业完成情况，错题已讲解，后续继续关注订正质量并及时和家长同步进展。",
      ],
    }),
    expect: { mustInclude: ["林小满"] },
    rawInput: "今天林小满作业完成，错题讲了两道。",
    answers: [],
    ...overrides,
  };
}

function failedNames(checks: ReturnType<typeof runChecks>): string[] {
  return checks.filter((check) => !check.passed).map((check) => check.name);
}

describe("runChecks", () => {
  it("结构和事实都满足时通过", () => {
    expect(failedNames(runChecks(input()))).toEqual([]);
  });

  it("缺少必含事实时失败", () => {
    const checks = runChecks(
      input({ expect: { mustInclude: ["周子航"] } }),
    );
    expect(failedNames(checks)).toContain("必含事实");
  });

  it("出现禁止内容时失败", () => {
    const checks = runChecks(
      input({ expect: { mustNotInclude: ["林小满"] } }),
    );
    expect(failedNames(checks)).toContain("禁止内容");
  });

  it("栏目数量不满足时失败", () => {
    const checks = runChecks(
      input({
        expect: {
          sections: { jiaoxiao: { minItems: 1 } },
        },
      }),
    );
    expect(failedNames(checks)).toContain("栏目覆盖");
  });

  it("追问数量和选项不合格时失败", () => {
    const checks = runChecks(
      input({
        mode: "questions",
        draft: draft({}, {
          questions: [
            {
              id: "q1",
              text: "今天有业绩进展吗？",
              options: ["没有"],
              multiple: false,
              target: "yeji",
            },
          ],
        }),
        expect: {
          minQuestions: 2,
          maxQuestions: 3,
          questionMustHaveOptions: true,
        },
      }),
    );
    expect(failedNames(checks)).toContain("追问质量");
  });

  it("改文风条目数变化时失败", () => {
    const before = draft({
      xueqing: [
        "林小满：完成今日作业，错题已讲解并整理，后续持续关注。",
      ],
    });
    const after = draft({
      xueqing: ["林小满：完成作业。", "林小满：讲错题。"],
    });
    const checks = runChecks(
      input({
        mode: "restyle",
        draft: after,
        beforeDraft: before,
        expect: { sameItemCount: true, detailedMustBeLonger: true },
      }),
    );
    expect(failedNames(checks)).toContain("条目数不变");
    expect(failedNames(checks)).toContain("详细版更长");
  });

  it("改文风保持条目数且更长时通过", () => {
    const before = draft({ xueqing: ["林小满：完成作业。"] });
    const after = draft({
      xueqing: [
        "对接学员林小满，跟进今日作业完成情况，完成错题讲解与整理，后续持续关注。",
      ],
    });

    expect(countItems(after)).toBe(1);
    const checks = runChecks(
      input({
        mode: "restyle",
        draft: after,
        beforeDraft: before,
        expect: {
          sameItemCount: true,
          detailedMustBeLonger: true,
        },
      }),
    );
    expect(failedNames(checks)).toEqual([]);
  });

  it("追问泄露内部概念时失败", () => {
    const checks = runChecks(
      input({
        mode: "questions",
        draft: draft(
          {},
          {
            questions: [
              {
                id: "q1",
                text: "长期记忆里陈一鸣的数学课已经签单，今天有跟家长同步反馈吗？",
                options: ["已经同步", "还没同步"],
                multiple: false,
                target: "yeji",
              },
            ],
          },
        ),
        expect: { minQuestions: 1, questionMustHaveOptions: true },
      }),
    );

    const quality = checks.find((check) => check.name === "追问质量");
    expect(quality?.passed).toBe(false);
    expect(quality?.detail).toContain("长期记忆里");
  });

  it("自然提到学生和事项时追问检查通过", () => {
    const checks = runChecks(
      input({
        mode: "questions",
        draft: draft(
          {},
          {
            questions: [
              {
                id: "q1",
                text: "陈一鸣的数学课已签单，今天上课后有跟家长同步反馈吗？",
                options: ["已经同步", "还没同步"],
                multiple: false,
                target: "yeji",
              },
            ],
          },
        ),
        expect: {},
      }),
    );

    expect(failedNames(checks)).not.toContain("追问质量");
  });

  it("richang 达到 25 字即可通过", () => {
    const richang =
      "今天跟进了林小满的作业和错题，家长已知情，明天继续检查订正。";

    expect(richang.length).toBeGreaterThanOrEqual(25);

    const checks = runChecks(
      input({
        draft: draft({
          xueqing: ["林小满：完成今日作业，错题已讲解。"],
          richang: [richang],
        }),
      }),
    );

    expect(failedNames(checks)).not.toContain("日常工作复盘");
  });

  it("richang 少于 25 字时失败", () => {
    const checks = runChecks(
      input({
        draft: draft({
          xueqing: ["林小满：完成今日作业，错题已讲解。"],
          richang: ["今天跟进了林小满的作业。"],
        }),
      }),
    );

    expect(failedNames(checks)).toContain("日常工作复盘");
  });
});

describe("EVAL_CASES 数据集", () => {
  it("所有用例都能通过自检", () => {
    const issues = EVAL_CASES.flatMap((item) =>
      validateCase(item).map((issue) => `${item.id}：${issue}`),
    );
    expect(issues).toEqual([]);
  });

  it("期望值引用了不存在的输入时会被发现", () => {
    const bad: EvalCase = {
      id: "bad-001",
      tags: ["bad"],
      mode: "final",
      rawInput: "今天整理了资料。",
      style: "concise",
      expect: { mustInclude: ["林小满"] },
    };

    expect(validateCase(bad).length).toBeGreaterThan(0);
  });

  it("覆盖 30 条以上且分类齐全", () => {
    expect(EVAL_CASES.length).toBeGreaterThanOrEqual(30);

    const tags = new Set(EVAL_CASES.flatMap((item) => item.tags));
    for (const tag of [
      "short",
      "medium",
      "long",
      "edge",
      "memory",
      "style",
    ]) {
      expect(tags.has(tag)).toBe(true);
    }
  });
});
