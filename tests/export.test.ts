import { describe, expect, it } from "vitest";
import { buildBackupMarkdown } from "@/lib/export";
import type { Memory, ReviewRecord, Student } from "@/lib/types";

const student: Student = {
  id: "student-1",
  name: "林小满",
  grade: "高一",
  subjects: "数学",
  status: "在读",
  note: null,
};

const memory: Memory = {
  id: "memory-1",
  scope: "student",
  studentId: "student-1",
  studentName: "林小满",
  category: "学习习惯",
  content: "数学基础较弱。",
  importance: 2,
  status: "active",
  lifecycle: "permanent",
  expiresAt: null,
  archiveAfter: null,
  archiveReason: null,
  sourceDate: "2026-11-19",
  createdAt: "2026-11-19T10:00:00.000Z",
  updatedAt: "2026-11-19T10:00:00.000Z",
};

const review: ReviewRecord = {
  id: "review-1",
  reviewDate: "2026-11-23",
  rawInput: "流水账",
  draft: {
    sections: {
      xueqing: [],
      jiaoxiao: [],
      yeji: [],
      richang: [],
      xiaocheng: [],
      kunnan: [],
      jiaoyan: [],
    },
    questions: [],
    notes: [],
  },
  finalText: "学管部工作复盘⬇️\n\n2026年11月23日工作复盘\n\n🍊【学情跟进】\n1️⃣林小满：完成作业。",
  style: "concise",
  conversation: [],
  round: 0,
  memoryExtractedAt: null,
  updatedAt: "2026-11-23T10:00:00.000Z",
};

describe("buildBackupMarkdown", () => {
  it("包含记忆、复盘和学生名单", () => {
    const output = buildBackupMarkdown({
      exportedAt: "2026-11-24T10:00:00.000Z",
      students: [student],
      memories: [memory],
      reviews: [review],
    });

    expect(output).toContain("# 学管复盘助手 · 数据备份");
    expect(output).toContain("### 林小满");
    expect(output).toContain(
      "- [学习习惯] 重要度 2/3 · 2026年11月19日：数学基础较弱。",
    );
    expect(output).toContain("### 2026年11月23日（简洁）");
    expect(output).toContain("林小满：完成作业。");
    expect(output).toContain("学生名单：林小满（在读）");
  });

  it("跳过没有正文的复盘", () => {
    const output = buildBackupMarkdown({
      exportedAt: "2026-11-24T10:00:00.000Z",
      students: [],
      memories: [],
      reviews: [{ ...review, id: "review-2", finalText: "  " }],
    });

    expect(output).toContain("（还没有历史复盘）");
    expect(output).not.toContain("2026年11月23日（简洁）");
  });

  it("空数据也能导出", () => {
    const output = buildBackupMarkdown({
      exportedAt: "2026-11-24T10:00:00.000Z",
      students: [],
      memories: [],
      reviews: [],
    });

    expect(output).toContain("（还没有长期记忆）");
    expect(output).toContain("学生名单：暂无");
  });
});

describe("buildBackupMarkdown 边界情况", () => {
  it("同名不同学生按 studentId 分开分组", () => {
    const otherStudent: Student = {
      ...student,
      id: "student-2",
      name: "林小满",
    };
    const otherMemory: Memory = {
      ...memory,
      id: "memory-2",
      studentId: "student-2",
      content: "英语口语需要加强。",
    };

    const output = buildBackupMarkdown({
      exportedAt: "2026-11-24T10:00:00.000Z",
      students: [student, otherStudent],
      memories: [memory, otherMemory],
      reviews: [],
    });

    expect(output.match(/### 林小满/g)?.length).toBe(2);
    expect(output).toContain("数学基础较弱。");
    expect(output).toContain("英语口语需要加强。");
  });

  it("多行记忆压成一行，复盘正文用引用块避免 Markdown 结构", () => {
    const multiLineMemory: Memory = {
      ...memory,
      content: "第一行\n第二行",
    };
    const multiLineReview: ReviewRecord = {
      ...review,
      finalText: "标题\n# 不是标题\n- 不是列表",
    };

    const output = buildBackupMarkdown({
      exportedAt: "2026-11-24T10:00:00.000Z",
      students: [student],
      memories: [multiLineMemory],
      reviews: [multiLineReview],
    });

    expect(output).toContain("第一行 第二行");
    expect(output).toContain("> # 不是标题");
    expect(output).toContain("> - 不是列表");
  });
});
