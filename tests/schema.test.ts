import { describe, expect, it } from "vitest";
import {
  draftSchema,
  generateRequestSchema,
  memoryExtractionSchema,
  memoryInputSchema,
  demoWeeklyExportRequestSchema,
  memoryLifecycleActionSchema,
  saveReviewSchema,
  studentInputSchema,
  weeklyReportContentSchema,
  weeklyReportGenerateRequestSchema,
  weeklyReportSaveSchema,
  weeklyReportStatusSchema,
} from "@/lib/schema";

function buildWeeklyContent() {
  return {
    summary: {
      miantan: "面谈内容",
      weixin: "微信内容",
    },
    metrics: {
      qingjia: "无",
      yujing: "无",
      tingke: "无",
      jieke: "无",
      kuoke: "无",
      xinqian: "无",
      xufei: "无",
      activeStudentsByGrade: "高一：2人\n合计：2人",
    },
    reflection: "心得",
    nextWeek: {
      zhongdianHuifang: "无",
      jiazhanghui: "无",
    },
    supportNeeded: "暂无",
  };
}

describe("generateRequestSchema", () => {
  it("接受最小请求并补默认值", () => {
    const parsed = generateRequestSchema.parse({
      date: "2026-11-13",
      rawInput: "今天林小满作业完成了。",
    });

    expect(parsed.style).toBe("concise");
    expect(parsed.answers).toEqual([]);
    expect(parsed.mode).toBe("final");
    expect(parsed.round).toBe(0);
  });

  it("拒绝空内容和错误日期", () => {
    expect(
      generateRequestSchema.safeParse({
        date: "2026-11-13",
        rawInput: "   ",
      }).success,
    ).toBe(false);

    expect(
      generateRequestSchema.safeParse({
        date: "2026/11/13",
        rawInput: "内容",
      }).success,
    ).toBe(false);
  });

  it("允许一篇复盘积累超过 12 条历史问答", () => {
    const answers = Array.from({ length: 14 }, (_, index) => ({
      question: `第 ${index + 1} 个问题`,
      answer: `第 ${index + 1} 个回答`,
    }));

    expect(
      generateRequestSchema.safeParse({
        date: "2026-11-13",
        rawInput: "今天林小满作业完成了。",
        answers,
      }).success,
    ).toBe(true);

    expect(
      saveReviewSchema.safeParse({
        date: "2026-11-13",
        draft: {},
        conversation: answers,
      }).success,
    ).toBe(true);
  });
});

describe("draftSchema", () => {
  it("允许追问携带可选的日常复盘 section 标识", () => {
    const parsed = draftSchema.parse({
      questions: [
        {
          text: "今天这些事推进下来，有没有哪个环节下次可以处理得更顺一点？",
          section: "richang",
        },
      ],
    });

    expect(parsed.questions?.[0]?.section).toBe("richang");
  });
});

describe("memoryExtractionSchema", () => {
  it("兼容旧格式：没有生命周期字段也能通过", () => {
    const parsed = memoryExtractionSchema.parse({
      memories: [
        {
          scope: "general",
          category: "工作流程",
          content: "每周五汇总课时。",
          importance: 2,
        },
      ],
    });

    expect(parsed.memories[0].lifecycle).toBeUndefined();
    expect(parsed.memories[0].ttlDays).toBeUndefined();
  });

  it("接受阶段性记忆和有效天数", () => {
    const parsed = memoryExtractionSchema.parse({
      memories: [
        {
          scope: "student",
          studentName: "陈一鸣",
          category: "课时排课",
          content: "周六数学课临时调到周日上午。",
          importance: 2,
          lifecycle: "ephemeral",
          ttlDays: 7,
        },
      ],
    });

    expect(parsed.memories[0].lifecycle).toBe("ephemeral");
    expect(parsed.memories[0].ttlDays).toBe(7);
  });

  it("拒绝超出范围的有效天数", () => {
    expect(
      memoryExtractionSchema.safeParse({
        memories: [
          { scope: "general", content: "内容", ttlDays: 91 },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("memoryInputSchema", () => {
  it("不传生命周期时保持 undefined，编辑不会误改长期/阶段性", () => {
    const parsed = memoryInputSchema.parse({
      scope: "general",
      category: "工作流程",
      content: "每天下班前发复盘。",
      importance: 2,
    });

    expect(parsed.lifecycle).toBeUndefined();
  });

  it("接受阶段性记忆和有效天数", () => {
    const parsed = memoryInputSchema.parse({
      scope: "general",
      category: "工作流程",
      content: "本周五前提交名单。",
      lifecycle: "ephemeral",
      ttlDays: 3,
    });

    expect(parsed.lifecycle).toBe("ephemeral");
    expect(parsed.ttlDays).toBe(3);
  });
});

describe("memoryLifecycleActionSchema", () => {
  it("只接受约定的四个动作", () => {
    for (const action of [
      "keep_permanent",
      "extend_7d",
      "archive",
      "restore",
    ]) {
      expect(
        memoryLifecycleActionSchema.safeParse({ action }).success,
      ).toBe(true);
    }

    expect(
      memoryLifecycleActionSchema.safeParse({ action: "delete" }).success,
    ).toBe(false);
  });
});

describe("weeklyReportContentSchema", () => {
  const content = {
    summary: {
      miantan: " 面谈内容 ",
      weixin: "微信内容",
    },
    metrics: {
      qingjia: "无",
      yujing: "无",
      tingke: "无",
      jieke: "无",
      kuoke: "无",
      xinqian: "无",
      xufei: "无",
      activeStudentsByGrade: "高一：2人\n合计：2人",
    },
    reflection: "心得",
    nextWeek: {
      zhongdianHuifang: "无",
      jiazhanghui: "无",
    },
    supportNeeded: "暂无",
  };

  it("接受完整结构并 trim 文本", () => {
    const parsed = weeklyReportContentSchema.parse(content);

    expect(parsed.summary.miantan).toBe("面谈内容");
    expect(parsed.metrics.activeStudentsByGrade).toBe("高一：2人\n合计：2人");
  });

  it("拒绝缺少 metrics 的结构", () => {
    expect(
      weeklyReportContentSchema.safeParse({ ...content, metrics: undefined })
        .success,
    ).toBe(false);
  });

  it("拒绝超长心得", () => {
    expect(
      weeklyReportContentSchema.safeParse({
        ...content,
        reflection: "字".repeat(4001),
      }).success,
    ).toBe(false);
  });
});

describe("weeklyReportStatusSchema", () => {
  it("只接受草稿和定稿", () => {
    expect(weeklyReportStatusSchema.safeParse("draft").success).toBe(true);
    expect(weeklyReportStatusSchema.safeParse("finalized").success).toBe(true);
    expect(weeklyReportStatusSchema.safeParse("archived").success).toBe(false);
  });
});

describe("weeklyReportGenerateRequestSchema", () => {
  it("允许不传自定义汇总区间", () => {
    const parsed = weeklyReportGenerateRequestSchema.safeParse({
      weekStart: "2026-11-25",
    });

    expect(parsed.success).toBe(true);
  });

  it("要求 sourceStartDate 和 sourceEndDate 同时传", () => {
    expect(
      weeklyReportGenerateRequestSchema.safeParse({
        weekStart: "2026-11-23",
        sourceStartDate: "2026-11-01",
      }).success,
    ).toBe(false);

    expect(
      weeklyReportGenerateRequestSchema.safeParse({
        weekStart: "2026-11-23",
        sourceEndDate: "2026-11-10",
      }).success,
    ).toBe(false);
  });

  it("拒绝开始日期晚于结束日期", () => {
    const parsed = weeklyReportGenerateRequestSchema.safeParse({
      weekStart: "2026-11-23",
      sourceStartDate: "2026-11-20",
      sourceEndDate: "2026-11-10",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain("开始日期");
    }
  });

  it("拒绝超过 14 天的汇总区间", () => {
    const parsed = weeklyReportGenerateRequestSchema.safeParse({
      weekStart: "2026-11-23",
      sourceStartDate: "2026-11-01",
      sourceEndDate: "2026-11-15",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain("14 天");
    }
  });

  it("允许正好 14 天", () => {
    expect(
      weeklyReportGenerateRequestSchema.safeParse({
        weekStart: "2026-11-23",
        sourceStartDate: "2026-11-01",
        sourceEndDate: "2026-11-14",
      }).success,
    ).toBe(true);
  });

  it("拒绝不存在的日历日期", () => {
    expect(
      weeklyReportGenerateRequestSchema.safeParse({
        weekStart: "2026-02-30",
      }).success,
    ).toBe(false);
  });
});

describe("weeklyReportSaveSchema", () => {
  it("接受完整内容，status 缺省为 draft", () => {
    const parsed = weeklyReportSaveSchema.parse({
      content: buildWeeklyContent(),
    });

    expect(parsed.status).toBe("draft");
  });

  it("接受 finalized 状态", () => {
    const parsed = weeklyReportSaveSchema.parse({
      content: buildWeeklyContent(),
      status: "finalized",
    });

    expect(parsed.status).toBe("finalized");
  });

  it("拒绝缺少 content 的请求", () => {
    expect(
      weeklyReportSaveSchema.safeParse({ status: "draft" }).success,
    ).toBe(false);
  });
});

describe("demoWeeklyExportRequestSchema", () => {
  it("接受完整自然周", () => {
    expect(
      demoWeeklyExportRequestSchema.safeParse({
        weekStart: "2026-11-23",
        weekEnd: "2026-11-29",
        content: buildWeeklyContent(),
      }).success,
    ).toBe(true);
  });

  it("拒绝不是完整自然周的区间", () => {
    expect(
      demoWeeklyExportRequestSchema.safeParse({
        weekStart: "2026-11-23",
        weekEnd: "2026-11-28",
        content: buildWeeklyContent(),
      }).success,
    ).toBe(false);
  });

  it("拒绝超长字段，防止公开接口被滥用", () => {
    expect(
      demoWeeklyExportRequestSchema.safeParse({
        weekStart: "2026-11-23",
        weekEnd: "2026-11-29",
        content: {
          ...buildWeeklyContent(),
          reflection: "字".repeat(4001),
        },
      }).success,
    ).toBe(false);
  });
});

describe("studentInputSchema", () => {
  it("trim 字段，空字符串转 null", () => {
    const parsed = studentInputSchema.parse({
      name: " 林小满 ",
      grade: "",
      subjects: " 数学、英语 ",
      status: "在读",
      note: "",
    });

    expect(parsed.name).toBe("林小满");
    expect(parsed.grade).toBeNull();
    expect(parsed.subjects).toBe("数学、英语");
    expect(parsed.note).toBeNull();
  });

  it("姓名必填", () => {
    expect(
      studentInputSchema.safeParse({
        name: "  ",
        status: "在读",
      }).success,
    ).toBe(false);
  });
});
