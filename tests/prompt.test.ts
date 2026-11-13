import { describe, expect, it } from "vitest";
import { buildPromptMessages, type PromptContext } from "@/lib/ai/prompt";
import {
  DEFAULT_SETTINGS,
  MAX_FOLLOW_UP_ROUNDS,
  emptyDraft,
} from "@/lib/types";

const BASE: PromptContext = {
  mode: "questions",
  reviewDate: "2026-11-13",
  style: "concise",
  settings: DEFAULT_SETTINGS,
  students: [],
  recentReviews: [],
  rawInput: "今天接待几位新家长，沟通了林小满课堂表现，没有提业绩。",
  answers: [],
  round: 1,
};

describe("buildPromptMessages", () => {
  it("追问模式只要求问题，不生成正文", () => {
    const [system, user] = buildPromptMessages(BASE);

    expect(system?.content).toContain("只输出 questions");
    expect(system?.content).toContain("不要输出 sections");
    expect(system?.content).toContain("五个核心栏目");
    expect(system?.content).toContain("选项里必须有“没有”");
    expect(user?.content).toContain("第 2 轮追问");
    expect(user?.content).toContain(`最多 ${MAX_FOLLOW_UP_ROUNDS} 轮`);
  });

  it("最终模式禁止追问，并要求保留空栏目", () => {
    const [system, user] = buildPromptMessages({
      ...BASE,
      mode: "final",
      round: MAX_FOLLOW_UP_ROUNDS,
    });

    expect(system?.content).toContain("不要再提问");
    expect(system?.content).toContain("questions 必须返回空数组");
    expect(system?.content).toContain(
      "五个核心栏目即使没有内容也保留空数组",
    );
    expect(system?.content).toContain(
      "已经被用户确认“没有”的栏目保持空数组",
    );
    expect(user?.content).toContain("questions 必须为空数组");
  });

  it("追问模式包含多选和 notes 规则，且不包含最终文风示例", () => {
    const [system] = buildPromptMessages(BASE);

    expect(system?.content).toContain("multiple");
    expect(system?.content).toContain("可多选");
    expect(system?.content).toContain("notes 不能代替追问");
    expect(system?.content).not.toContain("【示例：简洁版】");
  });

  it("最终模式包含文风和最终示例，不包含追问规则", () => {
    const [system] = buildPromptMessages({
      ...BASE,
      mode: "final",
      round: MAX_FOLLOW_UP_ROUNDS,
    });

    expect(system?.content).toContain("【文风】");
    expect(system?.content).toContain("【示例：简洁版】");
    expect(system?.content).not.toContain("【追问规则】");
  });

  it("改文风模式只以当前草稿为底稿，不重新提取流水账", () => {
    const draft = {
      ...emptyDraft(),
      sections: {
        ...emptyDraft().sections,
        xueqing: ["林小满：完成今日校内作业，错题已讲解。"],
        richang: ["服务再细致一些。"],
      },
    };

    const [system, user] = buildPromptMessages({
      ...BASE,
      mode: "restyle",
      currentDraft: draft,
    });

    expect(system?.content).toContain("只改文风");
    expect(system?.content).toContain("保留所有栏目");
    expect(system?.content).toContain("条目数量");
    expect(system?.content).toContain("不要原样照抄");
    expect(user?.content).toContain("【当前草稿】");
    expect(user?.content).not.toContain("【今天的流水账】");
    expect(user?.content).not.toContain("【已追问及回答】");
  });
});
