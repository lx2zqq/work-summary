import { describe, expect, it } from "vitest";
import {
  MEMORY_MERGE_THRESHOLD,
  formatMemoriesForPrompt,
  hasSameMemoryContent,
  isMemoryExtractionStale,
  memorySimilarity,
  normalizeMemoryText,
  resolveMemoryCopyAction,
  resolveMemoryStudent,
  selectMemoriesForPrompt,
} from "@/lib/memory";
import type { Memory, Student } from "@/lib/types";

const STUDENTS: Student[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "陈一鸣",
    grade: "初二",
    subjects: "数学",
    status: "在读",
    note: null,
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    name: "李宏轩",
    grade: null,
    subjects: null,
    status: "在读",
    note: null,
  },
];

function memory(overrides: Partial<Memory>): Memory {
  return {
    id: "memory-1",
    scope: "general",
    studentId: null,
    studentName: null,
    category: "其他",
    content: "通用记忆",
    importance: 2,
    status: "active",
    sourceDate: null,
    createdAt: "2026-11-13T00:00:00.000Z",
    updatedAt: "2026-11-13T00:00:00.000Z",
    ...overrides,
  };
}

describe("selectMemoriesForPrompt", () => {
  it("只带通用记忆和今天提到的学生记忆", () => {
    const memories = [
      memory({ id: "general", scope: "general" }),
      memory({
        id: "zhang",
        scope: "student",
        studentId: STUDENTS[0].id,
        studentName: "陈一鸣",
      }),
      memory({
        id: "li",
        scope: "student",
        studentId: STUDENTS[1].id,
        studentName: "李宏轩",
      }),
    ];

    const selected = selectMemoriesForPrompt(memories, {
      corpus: "今天跟陈一鸣妈妈沟通了数学课",
      students: STUDENTS,
    });

    expect(selected.map((item) => item.id)).toEqual([
      "general",
      "zhang",
    ]);
  });

  it("名单里没有但今天提到的学生，也带出记忆", () => {
    const memories = [
      memory({
        id: "unlinked",
        scope: "student",
        studentId: null,
        studentName: "陈一鸣",
      }),
    ];

    const selected = selectMemoriesForPrompt(memories, {
      corpus: "今天陈一鸣来上课了",
      students: STUDENTS,
    });

    expect(selected.map((item) => item.id)).toEqual(["unlinked"]);
  });

  it("按重要度排序并限制条数", () => {
    const memories = [
      memory({ id: "low", importance: 1 }),
      memory({ id: "high", importance: 3 }),
      memory({ id: "mid", importance: 2 }),
    ];

    const selected = selectMemoriesForPrompt(memories, {
      corpus: "",
      students: STUDENTS,
      limit: 2,
    });

    expect(selected.map((item) => item.id)).toEqual(["high", "mid"]);
  });

  it("忽略已归档记忆", () => {
    const selected = selectMemoriesForPrompt(
      [memory({ id: "archived", status: "archived" })],
      { corpus: "", students: STUDENTS },
    );

    expect(selected).toHaveLength(0);
  });
});

describe("formatMemoriesForPrompt", () => {
  it("按学生/通用输出可读文本", () => {
    const text = formatMemoriesForPrompt([
      {
        id: "1",
        scope: "student",
        studentName: "陈一鸣",
        category: "报名续费",
        content: "数学试听课已报名。",
        importance: 3,
      },
      {
        id: "2",
        scope: "general",
        studentName: null,
        category: "工作流程",
        content: "每周五发通知。",
        importance: 2,
      },
    ]);

    expect(text).toContain("- [陈一鸣] 数学试听课已报名。（报名续费，重要度 3）");
    expect(text).toContain("- [通用] 每周五发通知。（工作流程，重要度 2）");
  });
});

describe("resolveMemoryStudent", () => {
  it("优先按 id 匹配", () => {
    expect(
      resolveMemoryStudent(
        {
          scope: "student",
          studentId: STUDENTS[0].id,
          studentName: "随便写",
        },
        STUDENTS,
      ),
    ).toEqual({ studentId: STUDENTS[0].id, studentName: "陈一鸣" });
  });

  it("按姓名匹配学生名单", () => {
    expect(
      resolveMemoryStudent(
        { scope: "student", studentName: " 李宏轩 " },
        STUDENTS,
      ),
    ).toEqual({ studentId: STUDENTS[1].id, studentName: "李宏轩" });
  });

  it("名单里没有的名字保留原样但不关联 id", () => {
    expect(
      resolveMemoryStudent(
        { scope: "student", studentName: "新学生" },
        STUDENTS,
      ),
    ).toEqual({ studentId: null, studentName: "新学生" });
  });

  it("通用记忆清空学生字段", () => {
    expect(
      resolveMemoryStudent(
        {
          scope: "general",
          studentId: STUDENTS[0].id,
          studentName: "陈一鸣",
        },
        STUDENTS,
      ),
    ).toEqual({ studentId: null, studentName: null });
  });
});

describe("memorySimilarity", () => {
  it("同一件事的不同说法相似度高", () => {
    expect(
      memorySimilarity(
        "陈一鸣数学试听课已签单，家长已交费，安排在周六上课。",
        "陈一鸣数学试听课已签单，家长已续费，后续安排周六上课。",
      ),
    ).toBeGreaterThan(MEMORY_MERGE_THRESHOLD);
  });

  it("不同事情相似度低", () => {
    expect(
      memorySimilarity("陈一鸣妈妈偏好微信沟通。", "李宏轩写作业比较慢。"),
    ).toBeLessThan(0.2);
  });

  it("完全相同为 1", () => {
    expect(
      memorySimilarity("家长偏好微信沟通。", "家长偏好微信沟通。"),
    ).toBe(1);
  });
});

describe("resolveMemoryCopyAction", () => {
  it("记忆关闭时不触发", () => {
    expect(
      resolveMemoryCopyAction({
        enabled: false,
        extractedAt: null,
        stale: true,
      }),
    ).toBe("none");
  });

  it("第一次复制触发首次记忆", () => {
    expect(
      resolveMemoryCopyAction({
        enabled: true,
        extractedAt: null,
        stale: false,
      }),
    ).toBe("first");
  });

  it("正文有更新时触发刷新", () => {
    expect(
      resolveMemoryCopyAction({
        enabled: true,
        extractedAt: "2026-11-15T01:00:00.000Z",
        stale: true,
      }),
    ).toBe("refresh");
  });

  it("正文没变化时不重复触发", () => {
    expect(
      resolveMemoryCopyAction({
        enabled: true,
        extractedAt: "2026-11-15T01:00:00.000Z",
        stale: false,
      }),
    ).toBe("none");
  });
});

describe("isMemoryExtractionStale", () => {
  it("从未提取过需要更新", () => {
    expect(
      isMemoryExtractionStale({
        extractedAt: null,
        updatedAt: "2026-11-15T01:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("保存时间晚于提取时间需要更新", () => {
    expect(
      isMemoryExtractionStale({
        extractedAt: "2026-11-15T01:00:00.000Z",
        updatedAt: "2026-11-15T02:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("保存时间不晚于提取时间不需要更新", () => {
    expect(
      isMemoryExtractionStale({
        extractedAt: "2026-11-15T02:00:00.000Z",
        updatedAt: "2026-11-15T01:00:00.000Z",
      }),
    ).toBe(false);

    expect(
      isMemoryExtractionStale({
        extractedAt: "2026-11-15T02:00:00.000Z",
        updatedAt: "2026-11-15T02:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("时间格式异常时按需要更新处理", () => {
    expect(
      isMemoryExtractionStale({
        extractedAt: "not-a-date",
        updatedAt: "2026-11-15T02:00:00.000Z",
      }),
    ).toBe(true);
  });
});

describe("记忆内容比较", () => {
  it("忽略空格和标点", () => {
    expect(normalizeMemoryText("陈一鸣，数学试听！")).toBe(
      normalizeMemoryText("陈一鸣数学试听"),
    );

    expect(
      hasSameMemoryContent(
        memory({ content: "陈一鸣，数学试听课已报名。" }),
        "陈一鸣数学试听课已报名",
      ),
    ).toBe(true);
  });
});
