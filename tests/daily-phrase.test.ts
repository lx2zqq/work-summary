import { describe, expect, it } from "vitest";
import {
  DAILY_PHRASES,
  detectPhraseTheme,
  pickDailyPhrase,
} from "@/lib/daily-phrase";
import { emptyDraft, type ReviewDraft } from "@/lib/types";

function draftWith(text: string): ReviewDraft {
  return {
    ...emptyDraft(),
    sections: { ...emptyDraft().sections, xueqing: [text] },
  };
}

describe("pickDailyPhrase", () => {
  it("同一天话术固定", () => {
    expect(pickDailyPhrase("2026-11-13")).toBe(
      pickDailyPhrase("2026-11-13"),
    );
  });

  it("连续 7 天使用不同话术", () => {
    const dates = [
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
      "2026-11-16",
    ];
    const phrases = dates.map((date) => pickDailyPhrase(date));

    expect(new Set(phrases).size).toBe(dates.length);
  });

  it("没有草稿时使用通用主题", () => {
    expect(DAILY_PHRASES.general).toContain(
      pickDailyPhrase("2026-11-13"),
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

  it("按主题选择话术", () => {
    const phrase = pickDailyPhrase(
      "2026-11-13",
      draftWith("今天期中复习"),
    );

    expect(DAILY_PHRASES.exam).toContain(phrase);
  });

  it("固定库话术满足最低字数", () => {
    const phrases = Object.values(DAILY_PHRASES).flat();

    for (const phrase of phrases) {
      expect(phrase.length).toBeGreaterThanOrEqual(40);
      expect(phrase.length).toBeLessThanOrEqual(160);
    }
  });
});
