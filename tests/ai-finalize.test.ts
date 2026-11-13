import { describe, expect, it } from "vitest";
import { finalizeDraft } from "@/lib/ai/deepseek";
import type { PromptContext } from "@/lib/ai/prompt";
import { normalizeDraft } from "@/lib/draft";
import { DEFAULT_SETTINGS } from "@/lib/types";

function buildContext(
  overrides: Partial<PromptContext> = {},
): PromptContext {
  return {
    mode: "final",
    reviewDate: "2026-11-13",
    style: "concise",
    settings: DEFAULT_SETTINGS,
    students: [],
    recentReviews: [],
    rawInput: "今天林小满作业完成了。",
    answers: [],
    round: 0,
    ...overrides,
  };
}

describe("finalizeDraft 安全检查", () => {
  it("追问模式保留当前正文，只替换问题", () => {
    const current = normalizeDraft({
      sections: { xueqing: ["林小满：完成作业。"] },
    });
    const incoming = normalizeDraft({
      sections: {},
      questions: [{ text: "今天有试听吗？", options: ["没有", "有"] }],
    });

    const result = finalizeDraft(
      incoming,
      buildContext({ mode: "questions", currentDraft: current }),
    );

    expect(result.sections.xueqing).toEqual(["林小满：完成作业。"]);
    expect(result.questions).toHaveLength(1);
  });

  it("最终稿为空时抛错，不覆盖已有正文", () => {
    expect(() =>
      finalizeDraft(normalizeDraft({}), buildContext()),
    ).toThrow("没有生成有效正文");
  });

  it("改文风条目数不一致时抛错", () => {
    const current = normalizeDraft({
      sections: { xueqing: ["林小满：完成作业。"] },
    });

    expect(() =>
      finalizeDraft(
        normalizeDraft({ sections: {} }),
        buildContext({
          mode: "restyle",
          currentDraft: current,
        }),
      ),
    ).toThrow("改文风结果不完整");
  });

  it("最终稿漏栏目时用当前草稿补齐", () => {
    const current = normalizeDraft({
      sections: {
        xueqing: ["林小满：完成作业。"],
        jiaoxiao: ["林小满妈妈（微信）：沟通作业。"],
      },
    });
    const incoming = normalizeDraft({
      sections: { xueqing: ["林小满：完成今日作业。"] },
    });

    const result = finalizeDraft(
      incoming,
      buildContext({ currentDraft: current }),
    );

    expect(result.sections.xueqing).toEqual(["林小满：完成今日作业。"]);
    expect(result.sections.jiaoxiao).toEqual([
      "林小满妈妈（微信）：沟通作业。",
    ]);
  });
});
