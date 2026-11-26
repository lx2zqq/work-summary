import { describe, expect, it } from "vitest";
import {
  draftSchema,
  generateRequestSchema,
  saveReviewSchema,
  studentInputSchema,
} from "@/lib/schema";

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
