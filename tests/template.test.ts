import { describe, expect, it } from "vitest";
import { pickDailyPhrases } from "@/lib/daily-phrase";
import { normalizeItem, numberPrefix, renderReview } from "@/lib/template";
import { DEFAULT_SETTINGS, emptyDraft, type ReviewDraft } from "@/lib/types";

function draftWith(
  sections: Partial<ReviewDraft["sections"]>,
): ReviewDraft {
  return {
    ...emptyDraft(),
    sections: { ...emptyDraft().sections, ...sections },
  };
}

describe("renderReview", () => {
  it("核心 5 栏始终保留，空栏只留标题", () => {
    const text = renderReview(emptyDraft(), "2026-11-13", DEFAULT_SETTINGS);

    expect(text.startsWith("学管部工作复盘⬇️")).toBe(true);
    expect(text).toContain("2026年11月13日工作复盘");
    expect(text).toContain("🍊【学情跟进】");
    expect(text).toContain("🍊【家校沟通】");
    expect(text).toContain("🍊【业绩跟踪】");
    expect(text).toContain("🍊【日常工作复盘】");
    expect(text).toContain("🍊【小橙Ai推进】");
    expect(text).not.toContain("🍊【工作困难】");
    expect(text).not.toContain("🍊【教研相关】");
  });

  it("工作困难开启后，无内容时写标准句", () => {
    const text = renderReview(emptyDraft(), "2026-11-13", {
      ...DEFAULT_SETTINGS,
      showKunnan: true,
    });

    expect(text).toContain("🍊【工作困难】");
    expect(text).toContain(
      "1️⃣目前没有困难，有困难都已经想办法解决。",
    );
  });

  it("开启后自动补 3 条通用话术", () => {
    const date = "2026-11-13";
    const draft = draftWith({
      richang: ["今天主要跟进了林小满的作业，后续继续关注订正质量。"],
    });
    const text = renderReview(draft, date, {
      ...DEFAULT_SETTINGS,
      showFixedPhrase: true,
    });

    for (const phrase of pickDailyPhrases(date, draft, 3)) {
      expect(text).toContain(phrase);
    }
  });

  it("关闭时不追加通用话术", () => {
    const date = "2026-11-13";
    const draft = draftWith({
      richang: ["今天主要跟进了林小满的作业，后续继续关注订正质量。"],
    });
    const text = renderReview(draft, date, {
      ...DEFAULT_SETTINGS,
      showFixedPhrase: false,
    });

    expect(text).not.toContain(pickDailyPhrases(date, draft, 1)[0]);
  });

  it("旧版 dailyPhrase 在 richang 为空时作为第一条", () => {
    const date = "2026-11-13";
    const phrase =
      "临近期中，今天重点跟进了复习和错题订正情况。后续继续做好学情跟踪，及时同步家长。";
    const draft = { ...draftWith({}), dailyPhrase: phrase };
    const text = renderReview(draft, date, {
      ...DEFAULT_SETTINGS,
      showFixedPhrase: false,
    });

    expect(text).toContain(phrase);
  });

  it("旧版 dailyPhrase 在 richang 有内容时仍保留", () => {
    const date = "2026-11-13";
    const phrase =
      "临近期中，今天重点跟进了复习和错题订正情况。后续继续做好学情跟踪，及时同步家长。";
    const draft = {
      ...draftWith({ richang: ["今天主要跟进了林小满的作业。"] }),
      dailyPhrase: phrase,
    };
    const text = renderReview(draft, date, {
      ...DEFAULT_SETTINGS,
      showFixedPhrase: false,
    });

    expect(text).toContain(phrase);
  });

  it("旧版 dailyPhrase 过短时不使用", () => {
    const date = "2026-11-13";
    const draft = { ...draftWith({}), dailyPhrase: "服务更细致。" };
    const text = renderReview(draft, date, {
      ...DEFAULT_SETTINGS,
      showFixedPhrase: false,
    });

    expect(text).not.toContain("服务更细致。");
  });

  it("通用话术与已有条目重复时跳过，仍补足 3 条", () => {
    const date = "2026-11-13";
    const duplicate = pickDailyPhrases(date, draftWith({}), 1)[0];
    const draft = draftWith({ richang: [duplicate] });
    const text = renderReview(draft, date, {
      ...DEFAULT_SETTINGS,
      showFixedPhrase: true,
    });

    expect(text.split(duplicate)).toHaveLength(2);

    const others = pickDailyPhrases(date, draft, 4).filter(
      (phrase) => phrase !== duplicate,
    );
    expect(others).toHaveLength(3);
    for (const phrase of others) {
      expect(text).toContain(phrase);
    }
  });

  it("AI 当天复盘排在通用话术前面", () => {
    const date = "2026-11-13";
    const aiItem = "今天主要跟进了林小满的作业，后续继续关注订正质量。";
    const draft = draftWith({ richang: [aiItem] });
    const text = renderReview(draft, date, {
      ...DEFAULT_SETTINGS,
      showFixedPhrase: true,
    });

    expect(text.indexOf(aiItem)).toBeLessThan(
      text.indexOf(pickDailyPhrases(date, draft, 1)[0]),
    );
  });

  it("教研相关只在开启且有内容时出现", () => {
    const draft = draftWith({ jiaoyan: ["参加学管部教研。"] });

    expect(
      renderReview(draft, "2026-11-13", DEFAULT_SETTINGS),
    ).toContain("🍊【教研相关】");

    expect(
      renderReview(draft, "2026-11-13", {
        ...DEFAULT_SETTINGS,
        showJiaoyan: false,
      }),
    ).not.toContain("🍊【教研相关】");
  });

  it("1-10 用 emoji 序号，11 之后用数字点号", () => {
    const items = Array.from({ length: 12 }, (_, index) => `第${index + 1}条`);
    const text = renderReview(draftWith({ xueqing: items }), "2026-11-13", {
      ...DEFAULT_SETTINGS,
    });

    expect(text).toContain("🔟第10条");
    expect(text).toContain("11. 第11条");
    expect(text).toContain("12. 第12条");
  });

  it("清理模型自带的序号和重复条目", () => {
    expect(normalizeItem("1️⃣ 林小满：完成作业。")).toBe("林小满：完成作业。");
    expect(normalizeItem("12. 林小满：完成作业。")).toBe("林小满：完成作业。");

    const text = renderReview(
      draftWith({
        xueqing: ["1️⃣ 林小满：完成作业。", "林小满：完成作业。"],
      }),
      "2026-11-13",
      DEFAULT_SETTINGS,
    );

    expect(text.match(/林小满：完成作业。/g)).toHaveLength(1);
  });

  it("不会把小数当成列表序号删掉", () => {
    expect(normalizeItem("1.5万业绩已完成")).toBe("1.5万业绩已完成");
    expect(normalizeItem("2.5小时课时核对")).toBe("2.5小时课时核对");
    expect(normalizeItem("1. 林小满完成作业")).toBe("林小满完成作业");
  });

  it("序号辅助函数边界正确", () => {
    expect(numberPrefix(0)).toBe("1️⃣");
    expect(numberPrefix(9)).toBe("🔟");
    expect(numberPrefix(10)).toBe("11. ");
  });
});
