import { describe, expect, it } from "vitest";
import {
  EMPTY_ANSWER,
  answersFromConversation,
  buildAnswer,
  setAnswerCustom,
  toggleAnswerOption,
} from "@/lib/answers";
import type { FollowUpQuestion } from "@/lib/types";

describe("toggleAnswerOption", () => {
  it("单选题保留已填的补充内容", () => {
    const withCustom = setAnswerCustom(EMPTY_ANSWER, "已经和家长确认过");
    const next = toggleAnswerOption(withCustom, "已完成", false);

    expect(next.selected).toEqual(["已完成"]);
    expect(next.custom).toBe("已经和家长确认过");
  });

  it("单选题切换选项时替换选项但保留补充", () => {
    const first = toggleAnswerOption(EMPTY_ANSWER, "A", false);
    const withCustom = setAnswerCustom(first, "补充");
    const next = toggleAnswerOption(withCustom, "B", false);

    expect(next.selected).toEqual(["B"]);
    expect(next.custom).toBe("补充");
  });

  it("单选题再次点击取消选项，补充保留", () => {
    const selected = toggleAnswerOption(EMPTY_ANSWER, "A", false);
    const withCustom = setAnswerCustom(selected, "补充");
    const next = toggleAnswerOption(withCustom, "A", false);

    expect(next.selected).toEqual([]);
    expect(next.custom).toBe("补充");
  });

  it("多选题保留补充并切换多个选项", () => {
    const one = toggleAnswerOption(EMPTY_ANSWER, "A", true);
    const withCustom = setAnswerCustom(one, "补充");
    const two = toggleAnswerOption(withCustom, "B", true);

    expect(two.selected).toEqual(["A", "B"]);
    expect(two.custom).toBe("补充");

    const oneAgain = toggleAnswerOption(two, "A", true);
    expect(oneAgain.selected).toEqual(["B"]);
    expect(oneAgain.custom).toBe("补充");
  });
});

describe("setAnswerCustom", () => {
  it("输入补充时不清空已选选项", () => {
    const selected = toggleAnswerOption(EMPTY_ANSWER, "A", false);
    const next = setAnswerCustom(selected, "补充");

    expect(next.selected).toEqual(["A"]);
    expect(next.custom).toBe("补充");
  });
});

describe("buildAnswer", () => {
  it("选项和补充一起提交", () => {
    expect(
      buildAnswer({ selected: ["A", "B"], custom: " 补充 " }),
    ).toBe("A、B；补充：补充");
  });

  it("只有选项", () => {
    expect(buildAnswer({ selected: ["A"], custom: "  " })).toBe("A");
  });

  it("只有补充", () => {
    expect(buildAnswer({ selected: [], custom: " 补充 " })).toBe("补充");
  });
});

const QUESTIONS: FollowUpQuestion[] = [
  {
    id: "q1",
    text: "今天有试听吗？",
    options: ["没有", "有"],
    multiple: false,
    target: "yeji",
  },
  {
    id: "q2",
    text: "跟哪些家长沟通了？",
    options: ["林小满妈妈", "陈一鸣妈妈"],
    multiple: true,
    target: "jiaoxiao",
  },
  {
    id: "q3",
    text: "还有什么补充？",
    options: [],
    multiple: false,
    target: "general",
  },
];

describe("answersFromConversation", () => {
  it("还原选项、补充和纯文本答案", () => {
    const result = answersFromConversation(QUESTIONS, [
      { question: "今天有试听吗？", answer: "有；补充：周六过来" },
      {
        question: "跟哪些家长沟通了？",
        answer: "林小满妈妈、陈一鸣妈妈",
      },
      { question: "还有什么补充？", answer: "今天还打印了资料" },
    ]);

    expect(result.q1).toEqual({ selected: ["有"], custom: "周六过来" });
    expect(result.q2).toEqual({
      selected: ["林小满妈妈", "陈一鸣妈妈"],
      custom: "",
    });
    expect(result.q3).toEqual({
      selected: [],
      custom: "今天还打印了资料",
    });
  });

  it("自定义答案不会被误当成选项", () => {
    const result = answersFromConversation([QUESTIONS[0]], [
      {
        question: "今天有试听吗？",
        answer: "家长临时改到周日",
      },
    ]);

    expect(result.q1).toEqual({
      selected: [],
      custom: "家长临时改到周日",
    });
  });

  it("同一个问题多次回答时使用最后一次", () => {
    const result = answersFromConversation([QUESTIONS[0]], [
      { question: "今天有试听吗？", answer: "没有" },
      { question: "今天有试听吗？", answer: "有；补充：已确认" },
    ]);

    expect(result.q1).toEqual({
      selected: ["有"],
      custom: "已确认",
    });
  });
});
