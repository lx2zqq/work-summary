import { describe, expect, it, vi } from "vitest";
import {
  buildToolParams,
  createToolCache,
  executeTool,
  TOOL_DEFINITIONS,
  type ToolDeps,
} from "@/lib/ai/tools";
import type { MemoryPromptItem, Student } from "@/lib/types";

function student(name: string): Student {
  return {
    id: `student-${name}`,
    name,
    grade: "高一",
    subjects: "数学",
    status: "在读",
    note: null,
  };
}

function memory(content: string, id = "memory-1"): MemoryPromptItem {
  return {
    id,
    scope: "student",
    studentName: "林小满",
    category: "学习习惯",
    content,
    importance: 2,
  };
}

function makeDeps(overrides: Partial<ToolDeps> = {}): ToolDeps {
  return {
    searchStudents: async () => [student("林小满")],
    searchMemories: async () => [memory("数学薄弱，家长关注作业订正")],
    searchReviews: async () => [
      { date: "2026-11-14", text: "林小满：完成作业，错题已讲解。" },
    ],
    ...overrides,
  };
}

describe("工具定义", () => {
  it("暴露三个只读工具，且每个都有参数结构", () => {
    const params = buildToolParams();

    expect(params.map((item) => item.function.name)).toEqual([
      "search_students",
      "search_memories",
      "search_reviews",
    ]);

    for (const item of params) {
      expect(item.type).toBe("function");
      expect((item.function.description ?? "").length).toBeGreaterThan(10);
      expect(item.function.parameters).toBeTruthy();
    }
  });

  it("工具定义里没有写操作", () => {
    const names = TOOL_DEFINITIONS.map((tool) => tool.name);
    expect(names.every((name) => name.startsWith("search_"))).toBe(true);
  });
});

describe("executeTool", () => {
  it("search_students 返回精简字段", async () => {
    const result = await executeTool(
      "search_students",
      JSON.stringify({ query: "林" }),
      makeDeps(),
    );
    const payload = JSON.parse(result.content);

    expect(payload.count).toBe(1);
    expect(payload.students[0]).toEqual({
      name: "林小满",
      grade: "高一",
      subjects: "数学",
      status: "在读",
      note: null,
    });
  });

  it("search_memories 把命中的记忆回传给调用方", async () => {
    const result = await executeTool(
      "search_memories",
      JSON.stringify({ studentName: "林小满" }),
      makeDeps(),
    );

    expect(result.memories).toHaveLength(1);
    expect(JSON.parse(result.content).count).toBe(1);
  });

  it("search_reviews 按上限截断正文", async () => {
    const longText = "很长的历史复盘内容".repeat(300);

    const result = await executeTool(
      "search_reviews",
      JSON.stringify({ limit: 1 }),
      makeDeps({
        searchReviews: async () => [{ date: "2026-11-14", text: longText }],
      }),
    );
    const payload = JSON.parse(result.content);

    expect(payload.reviews[0].text.length).toBeLessThan(longText.length);
    expect(payload.reviews[0].text.endsWith("…")).toBe(true);
  });

  it("未知工具返回错误文本，不抛异常", async () => {
    const result = await executeTool("delete_everything", "{}", makeDeps());
    expect(JSON.parse(result.content).error).toContain("未知工具");
  });

  it("参数不是合法 JSON 时返回错误文本", async () => {
    const result = await executeTool("search_students", "{oops", makeDeps());
    expect(JSON.parse(result.content).error).toContain("合法 JSON");
  });

  it("参数不符合约束时返回错误文本", async () => {
    const result = await executeTool(
      "search_memories",
      JSON.stringify({ limit: 999 }),
      makeDeps(),
    );
    expect(JSON.parse(result.content).error).toContain("参数不符合要求");
  });

  it("查询抛错时返回错误文本，不影响整次生成", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await executeTool(
      "search_students",
      JSON.stringify({ query: "林" }),
      makeDeps({
        searchStudents: async () => {
          throw new Error("数据库连接失败");
        },
      }),
    );

    expect(JSON.parse(result.content).error).toBe("查询失败");
    warn.mockRestore();
  });
});

describe("createToolCache", () => {
  it("相同工具和参数只执行一次", async () => {
    const searchMemories = vi.fn(async () => [memory("只查一次")]);
    const deps = makeDeps({ searchMemories });
    const runTool = createToolCache();

    await runTool("search_memories", JSON.stringify({ studentName: "林小满" }), deps);
    await runTool("search_memories", JSON.stringify({ studentName: "林小满" }), deps);

    expect(searchMemories).toHaveBeenCalledTimes(1);
  });

  it("参数不同会重新查询", async () => {
    const searchMemories = vi.fn(async () => [memory("查两次")]);
    const deps = makeDeps({ searchMemories });
    const runTool = createToolCache();

    await runTool("search_memories", JSON.stringify({ studentName: "林小满" }), deps);
    await runTool("search_memories", JSON.stringify({ studentName: "陈一鸣" }), deps);

    expect(searchMemories).toHaveBeenCalledTimes(2);
  });
});

describe("createToolCache 边界", () => {
  it("参数键顺序不同但内容相同仍然命中缓存", async () => {
    const searchStudents = vi.fn(async () => [student("林小满")]);
    const deps = makeDeps({ searchStudents });
    const runTool = createToolCache();

    await runTool(
      "search_students",
      JSON.stringify({ query: "林", status: "在读" }),
      deps,
    );
    await runTool(
      "search_students",
      JSON.stringify({ status: "在读", query: "林" }),
      deps,
    );

    expect(searchStudents).toHaveBeenCalledTimes(1);
  });

  it("失败结果不缓存，重试会重新查询", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let calls = 0;
    const searchStudents = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("数据库连接失败");
      return [student("林小满")];
    });
    const deps = makeDeps({ searchStudents });
    const runTool = createToolCache();

    const first = await runTool(
      "search_students",
      JSON.stringify({ query: "林" }),
      deps,
    );
    expect(JSON.parse(first.content).error).toBe("查询失败");

    const second = await runTool(
      "search_students",
      JSON.stringify({ query: "林" }),
      deps,
    );
    expect(JSON.parse(second.content).count).toBe(1);
    expect(searchStudents).toHaveBeenCalledTimes(2);

    warn.mockRestore();
  });
});
