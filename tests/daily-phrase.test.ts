import { describe, expect, it } from "vitest";
import {
  DAILY_PHRASES,
  TARGET_PHRASE_MAX_LENGTH,
  TARGET_PHRASE_MIN_LENGTH,
  detectPhraseTheme,
  pickDailyPhrase,
  pickDailyPhrases,
} from "@/lib/daily-phrase";
import { emptyDraft, type ReviewDraft } from "@/lib/types";

function draftWith(text: string): ReviewDraft {
  return {
    ...emptyDraft(),
    sections: { ...emptyDraft().sections, xueqing: [text] },
  };
}

describe("pickDailyPhrases", () => {
  it("同一天抽取结果固定", () => {
    expect(pickDailyPhrases("2026-11-13")).toEqual(
      pickDailyPhrases("2026-11-13"),
    );
  });

  it("每天返回 3 条，且当天不重复", () => {
    const phrases = pickDailyPhrases("2026-11-13");

    expect(phrases).toHaveLength(3);
    expect(new Set(phrases).size).toBe(3);
  });

  it("连续 7 天组合不同", () => {
    const dates = [
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
      "2026-11-16",
    ];
    const combos = dates.map((date) =>
      pickDailyPhrases(date).join("|"),
    );

    expect(new Set(combos).size).toBe(dates.length);
  });

  it("命中主题时第一条来自主题池", () => {
    const phrases = pickDailyPhrases(
      "2026-11-13",
      draftWith("今天期中复习"),
    );

    expect(DAILY_PHRASES.exam).toContain(phrases[0]);
    expect(phrases).toHaveLength(3);
  });

  it("没有主题时全部来自通用池", () => {
    const phrases = pickDailyPhrases(
      "2026-11-13",
      draftWith("整理了资料"),
    );

    for (const phrase of phrases) {
      expect(DAILY_PHRASES.general).toContain(phrase);
    }
  });

  it("兼容旧调用只取 1 条", () => {
    expect(pickDailyPhrase("2026-11-13")).toBe(
      pickDailyPhrases("2026-11-13")[0],
    );
  });

  it("识别考试、会议、错题主题", () => {
    expect(detectPhraseTheme(draftWith("今天复习了期中考试内容"))).toBe(
      "exam",
    );
    expect(detectPhraseTheme(draftWith("今天参加部门会议"))).toBe(
      "meeting",
    );
    expect(detectPhraseTheme(draftWith("检查错题订正"))).toBe("mistake");
    expect(detectPhraseTheme(draftWith("整理了资料"))).toBe("general");
  });

  it("话术库每条落在 45~60 字的目标区间", () => {
    const phrases = Object.values(DAILY_PHRASES).flat();

    expect(phrases.length).toBeGreaterThanOrEqual(40);
    for (const phrase of phrases) {
      expect(phrase.length).toBeGreaterThanOrEqual(
        TARGET_PHRASE_MIN_LENGTH,
      );
      expect(phrase.length).toBeLessThanOrEqual(
        TARGET_PHRASE_MAX_LENGTH,
      );
    }
  });

  it("话术不出现学生姓名、金额和未确认结果", () => {
    const phrases = Object.values(DAILY_PHRASES).flat();

    for (const phrase of phrases) {
      expect(phrase).not.toMatch(/林小满|陈一鸣|周子航/);
      expect(phrase).not.toMatch(/\d+(?:\.\d+)?\s*(?:元|万|块)/);
      expect(phrase).not.toMatch(/待确认|待补充|未提供/);
    }
  });

  it("句式有变化，不是全部同一个开头", () => {
    const phrases = Object.values(DAILY_PHRASES).flat();
    const openers = new Set(phrases.map((phrase) => phrase.slice(0, 2)));

    // 49 条话术至少要有 12 种不同开头，避免整栏读起来像复制粘贴
    expect(openers.size).toBeGreaterThanOrEqual(12);
  });
});
