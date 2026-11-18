import { describe, expect, it } from "vitest";
import {
  PHRASE_MAX_LENGTH,
  PHRASE_MIN_LENGTH,
  canAddMorePhrases,
  collectExistingPhrases,
  isPhraseTheme,
  validateCustomPhrase,
} from "@/lib/ai/phrase";
import { MAX_CUSTOM_PHRASES, type CustomPhrase } from "@/lib/types";

function text(length: number): string {
  return "服".repeat(length);
}

function custom(content: string): CustomPhrase {
  return {
    id: "custom-1",
    theme: "general",
    content,
    createdAt: "2026-11-18T00:00:00.000Z",
  };
}

describe("validateCustomPhrase", () => {
  it("长度落在区间内、内容干净时通过", () => {
    const issues = validateCustomPhrase({
      phrase:
        "坚持把日常服务做细，排课、学情跟踪、课后反馈每个环节都跟到位，家长提出的问题当天响应，处理结果及时同步。",
      existing: [],
      studentNames: ["林小满"],
    });

    expect(issues).toEqual([]);
  });

  it("太短会提示具体字数", () => {
    const issues = validateCustomPhrase({
      phrase: text(PHRASE_MIN_LENGTH - 5),
      existing: [],
      studentNames: [],
    });

    expect(issues[0]).toContain("至少需要");
  });

  it("太长会提示上限", () => {
    const issues = validateCustomPhrase({
      phrase: text(PHRASE_MAX_LENGTH + 5),
      existing: [],
      studentNames: [],
    });

    expect(issues[0]).toContain("最多");
  });

  it("出现学生姓名会被拒绝", () => {
    const issues = validateCustomPhrase({
      phrase: `${text(PHRASE_MIN_LENGTH)}林小满`,
      existing: [],
      studentNames: ["林小满"],
    });

    expect(issues.join("；")).toContain("学生姓名");
  });

  it("出现金额会被拒绝", () => {
    const issues = validateCustomPhrase({
      phrase: `${text(PHRASE_MIN_LENGTH)}共 3000 元`,
      existing: [],
      studentNames: [],
    });

    expect(issues.join("；")).toContain("金额");
  });

  it("出现占位词会被拒绝", () => {
    const issues = validateCustomPhrase({
      phrase: `${text(PHRASE_MIN_LENGTH)}待补充`,
      existing: [],
      studentNames: [],
    });

    expect(issues.join("；")).toContain("占位词");
  });

  it("和已有话术高度相似会被拒绝", () => {
    const phrase =
      "坚持把日常服务做细，排课、学情跟踪、课后反馈每个环节都跟到位，家长的问题当天响应。";

    const issues = validateCustomPhrase({
      phrase,
      existing: [phrase],
      studentNames: [],
    });

    expect(issues.join("；")).toContain("太像");
  });

  it("空内容直接拒绝", () => {
    expect(
      validateCustomPhrase({
        phrase: "   ",
        existing: [],
        studentNames: [],
      }),
    ).toEqual(["话术内容为空"]);
  });

  it("原话命中错题主题时，改写结果必须提到错题", () => {
    const issues = validateCustomPhrase({
      phrase: `${text(PHRASE_MIN_LENGTH)}日常服务做细做实`,
      existing: [],
      studentNames: [],
      requiredTheme: "mistake",
    });

    expect(issues.join("；")).toContain("错题");
  });

  it("围绕主题改写后通过", () => {
    const issues = validateCustomPhrase({
      phrase:
        "这周错题收集整体比较齐，后续继续盯紧订正环节，把还没订正到位的单独提醒，确保每道错题都真正弄懂。",
      existing: [],
      studentNames: [],
      requiredTheme: "mistake",
    });

    expect(issues).toEqual([]);
  });
});

describe("话术库辅助函数", () => {
  it("合并内置和自定义话术后再做重复检查", () => {
    const merged = collectExistingPhrases(["内置一", "内置二"], [
      custom("自定义一"),
    ]);

    expect(merged).toEqual(["内置一", "内置二", "自定义一"]);
  });

  it("达到上限后不能继续添加", () => {
    const list = Array.from({ length: MAX_CUSTOM_PHRASES }, (_, index) =>
      custom(`第 ${index} 条`),
    );

    expect(canAddMorePhrases(list.slice(0, -1))).toBe(true);
    expect(canAddMorePhrases(list)).toBe(false);
  });

  it("主题枚举校验", () => {
    expect(isPhraseTheme("exam")).toBe(true);
    expect(isPhraseTheme("other")).toBe(false);
    expect(isPhraseTheme(undefined)).toBe(false);
  });
});
