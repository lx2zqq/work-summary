import { describe, expect, it } from "vitest";
import { buildPromptMessages, type PromptContext } from "@/lib/ai/prompt";
import {
  AI_SKIP_ANSWER,
  DEFAULT_SETTINGS,
  MAX_FOLLOW_UP_ROUNDS,
  RICHANG_MIN_CHARS,
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

  it("最终模式要求 richang 恰好 1 条，并提出温和的优化建议", () => {
    const [system] = buildPromptMessages({
      ...BASE,
      mode: "final",
      round: MAX_FOLLOW_UP_ROUNDS,
    });

    expect(system?.content).toContain("richang 必须恰好 1 条");
    expect(system?.content).toContain("30-70 个汉字");
    expect(system?.content).toContain(`${RICHANG_MIN_CHARS} 字以上`);
    expect(system?.content).toContain("温和");
    expect(system?.content).toContain("不要生硬自责");
    expect(system?.content).toContain("不知道说什么");
    expect(system?.content).toContain("今日表现不足");
    expect(system?.content).toContain("纯工作总结");
    expect(system?.content).not.toContain("dailyPhrase");
  });

  it("追问模式要求日常复盘追问带 section 标识", () => {
    const [system] = buildPromptMessages(BASE);

    expect(system?.content).toContain('"section": "richang"');
    expect(system?.content).toContain(
      "只有日常工作复盘追问才输出",
    );
    expect(system?.content).toContain(
      "结合当天流水账里的具体环节温和提问",
    );
  });

  it("用户跳过日常复盘追问时，最终 prompt 明确要求由 AI 提炼", () => {
    const [, user] = buildPromptMessages({
      ...BASE,
      mode: "final",
      round: MAX_FOLLOW_UP_ROUNDS,
      answers: [
        {
          question:
            "今天这些事推进下来，有没有哪个环节下次可以处理得更顺一点？",
          answer: AI_SKIP_ANSWER,
        },
      ],
    });

    expect(user?.content).toContain("【用户已跳过日常工作复盘追问】");
    expect(user?.content).toContain("不要照抄");
    expect(user?.content).toContain(AI_SKIP_ANSWER);
    expect(user?.content).toContain("温和、可落地的优化建议");
  });

  it("示例中的 richang 是温和优化建议，不是工作小结", () => {
    const [system] = buildPromptMessages({
      ...BASE,
      mode: "final",
      round: MAX_FOLLOW_UP_ROUNDS,
    });

    expect(system?.content).toContain("给林小满讲完错题后");
    expect(system?.content).toContain("后面就不用临时催了");
    expect(system?.content).not.toContain(
      "下次给林小满讲完错题，可以顺手",
    );
    expect(system?.content).not.toContain(
      "今天主要跟进了林小满的作业和错题，两道错题讲解后家长已经知情",
    );
  });

  it("richang 示例不共用同一条句式", () => {
    const [finalSystem] = buildPromptMessages({
      ...BASE,
      mode: "final",
      round: MAX_FOLLOW_UP_ROUNDS,
    });
    const [restyleSystem] = buildPromptMessages({
      ...BASE,
      mode: "restyle",
      currentDraft: emptyDraft(),
    });
    const finalContent = finalSystem?.content ?? "";
    const restyleContent = restyleSystem?.content ?? "";

    for (const content of [finalContent, restyleContent]) {
      expect(content.match(/可以顺手/g)?.length ?? 0).toBe(0);
      expect(content.match(/跟进会更顺/g)?.length ?? 0).toBe(0);
    }
    expect(finalContent).toContain("把订正检查的时间记在当天的跟进里");
    expect(restyleContent).toContain("这样第二次核对就能直接看结果");
  });

  it("改文风示例包含日常复盘的温和优化对比", () => {
    const [system] = buildPromptMessages({
      ...BASE,
      mode: "restyle",
      currentDraft: emptyDraft(),
    });

    expect(system?.content).toContain("【日常工作复盘的文风对比】");
    expect(system?.content).toContain("下次跟进作业前");
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

describe("restyle 模式", () => {
  const RESTYLE_BASE: PromptContext = {
    ...BASE,
    mode: "restyle",
    style: "detailed",
    currentDraft: emptyDraft(),
  };

  it("缺少当前草稿时直接报错", () => {
    expect(() => buildPromptMessages({ ...BASE, mode: "restyle" })).toThrow(
      "改文风需要当前草稿",
    );
  });

  it("只带草稿和目标文风，不带日期与轮次", () => {
    const [system, user] = buildPromptMessages(RESTYLE_BASE);

    expect(system?.content).toContain("只改文风");
    expect(system?.content).not.toContain("今天日期");
    expect(user?.content).not.toContain("今天日期");
    expect(user?.content).not.toContain("轮追问");
    expect(user?.content).toContain("【目标文风】");
  });
});
