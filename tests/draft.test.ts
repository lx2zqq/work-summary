import { describe, expect, it } from "vitest";
import {
  fallbackDraft,
  mergeFollowUpDraft,
  normalizeDraft,
} from "@/lib/draft";

describe("normalizeDraft", () => {
  it("补齐所有栏目并去重", () => {
    const draft = normalizeDraft({
      sections: {
        xueqing: ["1️⃣ 林小满：完成作业。", "林小满：完成作业。"],
      },
      questions: [],
      notes: [],
    });

    expect(draft.sections.xueqing).toEqual(["林小满：完成作业。"]);
    expect(draft.sections.jiaoxiao).toEqual([]);
    expect(draft.sections.kunnan).toEqual([]);
    expect(draft.sections.jiaoyan).toEqual([]);
  });

  it("追问最多 3 条，并保证 id 唯一", () => {
    const draft = normalizeDraft({
      questions: [
        { id: "q1", text: "问题1", options: ["没有"] },
        { id: "q1", text: "问题2", options: ["微信"] },
        { text: "问题3" },
        { text: "问题4" },
      ],
    });

    expect(draft.questions).toHaveLength(3);
    expect(new Set(draft.questions.map((item) => item.id)).size).toBe(3);
  });

  it("允许按轮次限制追问数量", () => {
    const draft = normalizeDraft(
      {
        questions: [
          { text: "问题1" },
          { text: "问题2" },
        ],
      },
      { maxQuestions: 0 },
    );

    expect(draft.questions).toEqual([]);
  });

  it("保留并清理 AI 生成的话术", () => {
    const draft = normalizeDraft({
      dailyPhrase:
        "1️⃣ 临近期中，今天重点跟进了复习和错题订正情况。后续继续做好学情跟踪，及时同步家长。",
    });

    expect(draft.dailyPhrase).toBe(
      "临近期中，今天重点跟进了复习和错题订正情况。后续继续做好学情跟踪，及时同步家长。",
    );
  });

  it("过短的话术视为无效，交给固定库兜底", () => {
    const draft = normalizeDraft({ dailyPhrase: "服务更细致。" });

    expect(draft.dailyPhrase).toBeUndefined();
  });

  it("保留追问的多选标记，缺省按单选处理", () => {
    const draft = normalizeDraft({
      questions: [
        {
          text: "今天跟哪些家长沟通了？",
          options: ["林小满妈妈", "其他家长"],
          multiple: true,
        },
        {
          text: "今天有试听吗？",
          options: ["有", "没有"],
        },
      ],
    });

    expect(draft.questions[0].multiple).toBe(true);
    expect(draft.questions[1].multiple).toBe(false);
  });
});

describe("mergeFollowUpDraft", () => {
  it("追问只替换问题，不清空已有正文", () => {
    const current = normalizeDraft({
      sections: {
        xueqing: ["林小满：完成作业，错题已讲解。"],
      },
      questions: [],
      notes: [],
    });
    const incoming = normalizeDraft({
      sections: {},
      questions: [{ text: "今天有试听吗？", options: ["没有", "有"] }],
      notes: ["想确认试听情况"],
    });

    const merged = mergeFollowUpDraft(current, incoming);

    expect(merged.sections.xueqing).toEqual([
      "林小满：完成作业，错题已讲解。",
    ]);
    expect(merged.questions).toHaveLength(1);
    expect(merged.notes).toEqual(["想确认试听情况"]);
  });

  it("追问时保留已有固定话术", () => {
    const current = normalizeDraft({
      dailyPhrase:
        "临近期中，今天重点跟进了复习和错题订正情况。后续继续做好学情跟踪，及时同步家长。",
    });
    const incoming = normalizeDraft({
      questions: [{ text: "今天有试听吗？", options: ["没有", "有"] }],
    });

    const merged = mergeFollowUpDraft(current, incoming);

    expect(merged.dailyPhrase).toBe(current.dailyPhrase);
  });
});

describe("fallbackDraft", () => {
  it("把原文拆成学情跟进条目，并给出提示", () => {
    const draft = fallbackDraft("林小满作业完成。错题讲了两道；家长已沟通");

    expect(draft.sections.xueqing).toEqual([
      "林小满作业完成",
      "错题讲了两道",
      "家长已沟通",
    ]);
    expect(draft.notes.length).toBe(1);
  });

  it("超长兜底条目会截到服务端允许的 600 字以内", () => {
    const draft = fallbackDraft("长".repeat(900));

    expect(draft.sections.xueqing[0]).toHaveLength(600);
  });
});
