import { describe, expect, it } from "vitest";
import { parseMemoryExtractResponse } from "@/lib/ai/memory";
import {
  MEMORY_MERGE_THRESHOLD,
  formatMemoriesForPrompt,
  formatMemoryRemaining,
  hasSameMemoryContent,
  isMemoryExtractionStale,
  memorySimilarity,
  normalizeMemoryText,
  resolveMemoryCopyAction,
  resolveMemoryExpiry,
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
    lifecycle: "permanent",
    expiresAt: null,
    archiveAfter: null,
    archiveReason: null,
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

  it("忽略已过期的阶段性记忆", () => {
    const selected = selectMemoriesForPrompt(
      [
        memory({
          id: "expired",
          lifecycle: "ephemeral",
          expiresAt: "2020-01-01T00:00:00.000Z",
        }),
      ],
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

describe("parseMemoryExtractResponse", () => {
  it("解析 Markdown 代码块包裹的 JSON", () => {
    const result = parseMemoryExtractResponse(
      '```json\n{"memories":[{"scope":"general","category":"工作流程","content":"每周五汇总课时。","importance":2}]}\n```',
    );

    expect(result.memories).toHaveLength(1);
    expect(result.memories?.[0].content).toBe("每周五汇总课时。");
  });

  it("兼容裸数组返回", () => {
    const result = parseMemoryExtractResponse(
      '[{"scope":"student","studentName":"陈一鸣","category":"家长沟通","content":"妈妈偏好微信沟通。","importance":2}]',
    );

    expect(result.memories?.[0]).toMatchObject({
      scope: "student",
      studentName: "陈一鸣",
      category: "家长沟通",
    });
  });

  it("从前后解释文字中截取 JSON，内容里的括号不影响结尾", () => {
    const result = parseMemoryExtractResponse(
      '好的，结果如下：{"memories":[{"scope":"general","category":"工作流程","content":"整理[周报]后再发群。","importance":2}]} 希望有帮助',
    );

    expect(result.memories?.[0].content).toBe("整理[周报]后再发群。");
  });

  it("兼容缺失 memories 包装的单条对象", () => {
    const result = parseMemoryExtractResponse(
      '{"scope":"general","category":"工作流程","content":"每天下班前发复盘。","importance":1}',
    );

    expect(result.memories).toHaveLength(1);
    expect(result.memories?.[0].importance).toBe(1);
  });

  it("未知枚举与越界数值安全兜底", () => {
    const result = parseMemoryExtractResponse(
      JSON.stringify({
        memories: [
          {
            scope: "general",
            category: "学习",
            content: "每天检查作业。",
            importance: "很高",
          },
          {
            scope: "general",
            category: "不存在的分类",
            content: "临时事项。",
            importance: 9,
          },
        ],
      }),
    );

    expect(result.memories?.[0].category).toBe("学习习惯");
    expect(result.memories?.[0].importance).toBe(3);
    expect(result.memories?.[1].category).toBe("其他");
    expect(result.memories?.[1].importance).toBe(3);
  });

  it("过滤无效空条目", () => {
    const result = parseMemoryExtractResponse(
      JSON.stringify({
        memories: [
          { content: "" },
          { scope: "general", content: "   " },
          { scope: "student", studentName: "", content: "没有学生" },
          {
            scope: "general",
            category: "工作流程",
            content: "有效内容",
            importance: 2,
          },
        ],
      }),
    );

    expect(result.memories).toHaveLength(1);
    expect(result.memories?.[0].content).toBe("有效内容");
  });

  it("解析 lifecycle 与 ttlDays，异常值安全兜底", () => {
    const result = parseMemoryExtractResponse(
      JSON.stringify({
        memories: [
          {
            scope: "general",
            content: "本周五前提交名单。",
            lifecycle: "ephemeral",
            ttlDays: "14",
          },
          {
            scope: "general",
            content: "临时事项。",
            lifecycle: "unknown",
            ttlDays: 500,
          },
          {
            scope: "general",
            content: "长期规范。",
          },
        ],
      }),
    );

    expect(result.memories?.[0].lifecycle).toBe("ephemeral");
    expect(result.memories?.[0].ttlDays).toBe(14);
    expect(result.memories?.[1].lifecycle).toBe("ephemeral");
    expect(result.memories?.[1].ttlDays).toBe(90);
    expect(result.memories?.[2].lifecycle).toBe("permanent");
    expect(result.memories?.[2].ttlDays).toBeUndefined();
  });

  it("输出完全不是 JSON 时返回错误", () => {
    const result = parseMemoryExtractResponse("今天没什么可记的");

    expect(result.memories).toBeNull();
    expect(result.error).not.toBe("");
  });
});

describe("resolveMemoryExpiry", () => {
  const now = new Date("2026-11-27T00:00:00.000Z");

  it("长期记忆没有过期时间", () => {
    expect(resolveMemoryExpiry({ lifecycle: "permanent", now })).toBeNull();
    expect(resolveMemoryExpiry({ now })).toBeNull();
  });

  it("阶段性记忆默认 7 天，并按上限截断", () => {
    expect(resolveMemoryExpiry({ lifecycle: "ephemeral", now })).toBe(
      "2026-12-04T00:00:00.000Z",
    );
    expect(
      resolveMemoryExpiry({ lifecycle: "ephemeral", ttlDays: 3, now }),
    ).toBe("2026-11-30T00:00:00.000Z");
    expect(
      resolveMemoryExpiry({ lifecycle: "ephemeral", ttlDays: 999, now }),
    ).toBe("2027-02-25T00:00:00.000Z");
    expect(
      resolveMemoryExpiry({ lifecycle: "ephemeral", ttlDays: 0, now }),
    ).toBe("2026-11-28T00:00:00.000Z");
  });
});

describe("formatMemoryRemaining", () => {
  const now = new Date("2026-11-27T10:00:00.000Z");

  it("按上海时区自然日显示，今天到期单独处理", () => {
    expect(formatMemoryRemaining("2026-11-30T10:00:00.000Z", now)).toBe(
      "剩余 3 天",
    );
    // 3 天零几小时不能向上取整成 4 天
    expect(
      formatMemoryRemaining(
        "2026-11-30T10:00:00.000Z",
        new Date("2026-11-27T05:37:00.000Z"),
      ),
    ).toBe("剩余 3 天");
    expect(formatMemoryRemaining("2026-11-27T09:00:00.000Z", now)).toBe(
      "今天到期",
    );
  });

  it("没有过期时间或格式异常时返回空串", () => {
    expect(formatMemoryRemaining(null, now)).toBe("");
    expect(formatMemoryRemaining("not-a-date", now)).toBe("");
  });
});
