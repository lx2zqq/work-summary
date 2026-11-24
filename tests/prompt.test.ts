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
  memories: [],
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

  it("有长期记忆时注入背景和使用规则", () => {
    const [system, user] = buildPromptMessages({
      ...BASE,
      memories: [
        {
          id: "memory-1",
          scope: "student",
          studentName: "林小满",
          category: "家长沟通",
          content: "林小满妈妈偏好微信沟通。",
          importance: 2,
        },
      ],
    });

    expect(user?.content).toContain("【长期记忆");
    expect(user?.content).toContain("林小满妈妈偏好微信沟通");
    expect(system?.content).toContain(
      "不要把记忆里的旧事写成今天发生的事",
    );
  });

  it("改文风模式不注入长期记忆", () => {
    const draft = {
      ...emptyDraft(),
      sections: {
        ...emptyDraft().sections,
        xueqing: ["林小满：完成今日校内作业。"],
      },
    };

    const [system] = buildPromptMessages({
      ...BASE,
      mode: "restyle",
      currentDraft: draft,
      memories: [
        {
          id: "memory-1",
          scope: "student",
          studentName: "林小满",
          category: "家长沟通",
          content: "林小满妈妈偏好微信沟通。",
          importance: 2,
        },
      ],
    });

    expect(system?.content).not.toContain("【长期记忆】");
  });

  it("最终模式要求 richang 恰好 1 条且 40-70 字", () => {
    const [system] = buildPromptMessages({
      ...BASE,
      mode: "final",
      round: MAX_FOLLOW_UP_ROUNDS,
    });

    expect(system?.content).toContain("richang 必须恰好 1 条");
    expect(system?.content).toContain("40-70 个汉字");
    expect(system?.content).not.toContain("dailyPhrase");
  });

  it("通用话术开关只影响程序追加，不要求模型输出", () => {
    const [open] = buildPromptMessages({
      ...BASE,
      mode: "final",
      round: MAX_FOLLOW_UP_ROUNDS,
      settings: { ...DEFAULT_SETTINGS, showFixedPhrase: true },
    });
    const [closed] = buildPromptMessages({
      ...BASE,
      mode: "final",
      round: MAX_FOLLOW_UP_ROUNDS,
      settings: { ...DEFAULT_SETTINGS, showFixedPhrase: false },
    });

    expect(open?.content).toContain("自动追加 3 条通用话术");
    expect(closed?.content).toContain("程序不会追加");
    expect(open?.content).not.toContain("dailyPhrase");
    expect(closed?.content).not.toContain("dailyPhrase");
  });

  it("工具模式不再预注入学生名单、长期记忆和最近复盘", () => {
    const memory = {
      id: "memory-1",
      scope: "student" as const,
      studentName: "林小满",
      category: "家长沟通" as const,
      content: "林小满妈妈偏好微信沟通。",
      importance: 2,
    };
    const context: PromptContext = {
      ...BASE,
      mode: "final",
      round: MAX_FOLLOW_UP_ROUNDS,
      toolsEnabled: true,
      students: [
        {
          id: "student-1",
          name: "林小满",
          grade: "高一",
          subjects: "数学",
          status: "在读",
          note: null,
        },
      ],
      memories: [memory],
      recentReviews: [{ date: "2026-11-12", text: "昨天的复盘正文" }],
    };

    const [system, user] = buildPromptMessages(context);

    expect(system?.content).toContain("【可用工具】");
    expect(system?.content).not.toContain("【学生名单】");
    expect(system?.content).not.toContain("【最近复盘】");
    expect(system?.content).not.toContain("长期记忆使用规则");
    expect(user?.content).not.toContain("【长期记忆");
    expect(user?.content).not.toContain("林小满妈妈偏好微信沟通");
    expect(user?.content).not.toContain("昨天的复盘正文");
  });

  it("工具模式的追问阶段要求先查学生记忆", () => {
    const [system] = buildPromptMessages({
      ...BASE,
      toolsEnabled: true,
    });

    expect(system?.content).toContain("【工具追问规则】");
    expect(system?.content).toContain(
      "流水账里出现任何学生姓名时，必须先调用 search_memories",
    );
    expect(system?.content).toContain("【可用工具】");
  });

  it("关闭工具时保持原来的预注入行为", () => {
    const [system] = buildPromptMessages({
      ...BASE,
      mode: "final",
      round: MAX_FOLLOW_UP_ROUNDS,
      toolsEnabled: false,
      students: [
        {
          id: "student-1",
          name: "林小满",
          grade: "高一",
          subjects: "数学",
          status: "在读",
          note: null,
        },
      ],
      recentReviews: [{ date: "2026-11-12", text: "昨天的复盘正文" }],
    });

    expect(system?.content).toContain("【学生名单】");
    expect(system?.content).toContain("【最近复盘】");
    expect(system?.content).toContain("昨天的复盘正文");
    expect(system?.content).not.toContain("【可用工具】");
  });

  it("改文风模式即使开着工具也不包含工具说明", () => {
    const draft = {
      ...emptyDraft(),
      sections: {
        ...emptyDraft().sections,
        xueqing: ["林小满：完成今日校内作业。"],
      },
    };

    const [system] = buildPromptMessages({
      ...BASE,
      mode: "restyle",
      toolsEnabled: true,
      currentDraft: draft,
    });

    expect(system?.content).not.toContain("【可用工具】");
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

  it("详细版禁止机械套用空泛尾句", () => {
    const [system] = buildPromptMessages({
      ...BASE,
      mode: "final",
      round: MAX_FOLLOW_UP_ROUNDS,
      style: "detailed",
    });

    expect(system?.content).toContain("不要机械套用");
    expect(system?.content).toContain("整体完成情况正常");
    expect(system?.content).not.toContain(
      "后续持续关注其课堂吸收情况",
    );
    expect(system?.content).not.toContain(
      "对接学员林小满，跟进今日校内作业",
    );
  });

  it("追问规则不暴露内部实现概念", () => {
    const [system] = buildPromptMessages(BASE);

    expect(system?.content).toContain("不要出现“长期记忆里”");
    expect(system?.content).not.toContain("长期记忆里陈一鸣");
  });

  it("重复规则只声明一次且不产生连续空行", () => {
    const [system] = buildPromptMessages({
      ...BASE,
      mode: "final",
      round: MAX_FOLLOW_UP_ROUNDS,
    });
    const content = system?.content ?? "";

    expect(content.match(/条目不要带序号/g)).toHaveLength(1);
    expect(
      content.match(/“待确认”“待补充”“未提供”/g),
    ).toHaveLength(1);
    expect(content.match(/richang 必须恰好 1 条/g)).toHaveLength(1);
    expect(content).not.toMatch(/\n{3,}/);
  });
});
