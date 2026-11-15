import { describe, expect, it } from "vitest";
import {
  DAILY_PHRASES,
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

  it("话术库每条不少于 20 字", () => {
    const phrases = Object.values(DAILY_PHRASES).flat();

    expect(phrases.length).toBeGreaterThanOrEqual(40);
    for (const phrase of phrases) {
      expect(phrase.length).toBeGreaterThanOrEqual(20);
      expect(phrase.length).toBeLessThanOrEqual(160);
    }
  });
});
