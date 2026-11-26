import { z } from "zod";
import type { ChatCompletionFunctionTool } from "openai/resources/chat/completions";
import { isValidISODate } from "@/lib/date";
import type { MemoryPromptItem, Student } from "@/lib/types";

/** 单次工具返回给模型的文字上限，避免把历史全量拖进上下文 */
const MAX_REVIEW_CHARS = 1200;
const MAX_REVIEW_RESULTS = 5;
const MAX_MEMORY_RESULTS = 20;
const MAX_STUDENT_RESULTS = 20;

export const searchStudentsSchema = z.object({
  query: z.string().trim().max(20).optional(),
  status: z.enum(["在读", "停课", "潜在", "已结课"]).optional(),
  grade: z.string().trim().max(20).optional(),
});

export const searchMemoriesSchema = z.object({
  studentName: z.string().trim().max(20).optional(),
  keyword: z.string().trim().max(20).optional(),
  scope: z.enum(["student", "general"]).optional(),
  limit: z.number().int().min(1).max(MAX_MEMORY_RESULTS).optional(),
});

export const searchReviewsSchema = z.object({
  keyword: z.string().trim().max(20).optional(),
  beforeDate: z
    .string()
    .refine(isValidISODate, "日期格式不对")
    .optional(),
  afterDate: z
    .string()
    .refine(isValidISODate, "日期格式不对")
    .optional(),
  limit: z.number().int().min(1).max(MAX_REVIEW_RESULTS).optional(),
});

export type SearchStudentsInput = z.infer<typeof searchStudentsSchema>;
export type SearchMemoriesInput = z.infer<typeof searchMemoriesSchema>;
export type SearchReviewsInput = z.infer<typeof searchReviewsSchema>;

/**
 * 工具执行依赖由调用方注入：
 * 生产环境接数据库查询，测试环境可以传假数据。
 */
export type ToolDeps = {
  searchStudents: (input: SearchStudentsInput) => Promise<Student[]>;
  searchMemories: (input: SearchMemoriesInput) => Promise<MemoryPromptItem[]>;
  searchReviews: (
    input: SearchReviewsInput,
  ) => Promise<Array<{ date: string; text: string }>>;
};

export type ToolName =
  | "search_students"
  | "search_memories"
  | "search_reviews";

type ToolDefinition = {
  name: ToolName;
  description: string;
  parameters: Record<string, unknown>;
};

/**
 * 三个工具都是只读查询。
 * 描述写清“什么时候用”，因为模型的调用决策完全依赖这里的文字。
 */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "search_students",
    description:
      "按姓名片段、状态或年级查询学生名单。用于确认学生是否在册、补全年级和科目。不确定姓名写法时先查一次。",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "学生姓名或姓名片段，可选" },
        status: {
          type: "string",
          enum: ["在读", "停课", "潜在", "已结课"],
          description: "学生状态，可选",
        },
        grade: { type: "string", description: "年级，可选" },
      },
    },
  },
  {
    name: "search_memories",
    description:
      "查询长期记忆。流水账里出现学生姓名时，必须先查该学生的记忆；用户提到“上次”“之前”“一直”这类背景时也用它。不传条件时返回重要度最高的几条。",
    parameters: {
      type: "object",
      properties: {
        studentName: { type: "string", description: "学生姓名，可选" },
        keyword: { type: "string", description: "记忆内容关键词，可选" },
        scope: {
          type: "string",
          enum: ["student", "general"],
          description: "记忆范围，可选",
        },
        limit: {
          type: "number",
          description: "返回条数，1-20，默认 8",
        },
      },
    },
  },
  {
    name: "search_reviews",
    description:
      "查询历史复盘正文。用户提到“上次”“前几天”“前段时间”做过的事时使用。不传日期默认查最近两次。",
    parameters: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "正文关键词，可选" },
        beforeDate: {
          type: "string",
          description: "查询此日期之前的复盘，格式 YYYY-MM-DD，可选",
        },
        afterDate: {
          type: "string",
          description: "查询此日期之后的复盘，格式 YYYY-MM-DD，可选",
        },
        limit: { type: "number", description: "返回条数，1-5，默认 2" },
      },
    },
  },
];

export function buildToolParams(): ChatCompletionFunctionTool[] {
  return TOOL_DEFINITIONS.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function formatStudents(students: Student[]) {
  return students.slice(0, MAX_STUDENT_RESULTS).map((student) => ({
    name: student.name,
    grade: student.grade,
    subjects: student.subjects,
    status: student.status,
    note: student.note,
  }));
}

function formatMemories(memories: MemoryPromptItem[]) {
  return memories.slice(0, MAX_MEMORY_RESULTS).map((memory) => ({
    studentName: memory.studentName,
    category: memory.category,
    content: memory.content,
    importance: memory.importance,
  }));
}

function formatReviews(reviews: Array<{ date: string; text: string }>) {
  return reviews.slice(0, MAX_REVIEW_RESULTS).map((review) => ({
    date: review.date,
    text: truncate(review.text, MAX_REVIEW_CHARS),
  }));
}

export type ToolExecution = {
  /** 回传给模型的 JSON 文本，失败时也是 JSON，不抛异常 */
  content: string;
  /** 本次工具命中的记忆，用于前端展示“参考了哪些记忆” */
  memories: MemoryPromptItem[];
  /** 失败结果不写入缓存，避免模型换参数重试时拿到旧错误 */
  ok: boolean;
};

function failure(message: string): ToolExecution {
  return {
    content: JSON.stringify({ error: message }),
    memories: [],
    ok: false,
  };
}

function parseArgs(raw: string): { ok: true; value: unknown } | { ok: false } {
  if (!raw.trim()) return { ok: true, value: {} };

  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

/**
 * 执行一次工具调用。
 * 所有异常都在这里吞掉并转成错误文本：让模型自己决定换参数还是放弃，
 * 不要把一条坏的工具调用变成整个生成请求失败。
 */
export async function executeTool(
  name: string,
  rawArgs: string,
  deps: ToolDeps,
): Promise<ToolExecution> {
  const parsedArgs = parseArgs(rawArgs);
  if (!parsedArgs.ok) return failure("参数不是合法 JSON");

  try {
    if (name === "search_students") {
      const input = searchStudentsSchema.parse(parsedArgs.value);
      const students = await deps.searchStudents(input);
      return {
        content: JSON.stringify({
          count: students.length,
          students: formatStudents(students),
        }),
        memories: [],
        ok: true,
      };
    }

    if (name === "search_memories") {
      const input = searchMemoriesSchema.parse(parsedArgs.value);
      const memories = await deps.searchMemories({
        ...input,
        limit: input.limit ?? 8,
      });
      return {
        content: JSON.stringify({
          count: memories.length,
          memories: formatMemories(memories),
        }),
        memories,
        ok: true,
      };
    }

    if (name === "search_reviews") {
      const input = searchReviewsSchema.parse(parsedArgs.value);
      const reviews = await deps.searchReviews({
        ...input,
        limit: input.limit ?? 2,
      });
      return {
        content: JSON.stringify({
          count: reviews.length,
          reviews: formatReviews(reviews),
        }),
        memories: [],
        ok: true,
      };
    }

    return failure(`未知工具：${name}`);
  } catch (error) {
    // 数据库/SDK 的原始报错只写服务端日志，不能透传给模型
    const detail =
      error instanceof z.ZodError ? "参数不符合要求" : "查询失败";
    console.warn(
      `[tools] ${name} 执行失败：`,
      error instanceof Error ? error.message : error,
    );
    return failure(detail);
  }
}

/** 参数键排序后作为缓存 key，键顺序不同但内容相同的调用也能命中 */
function normalizeArgsKey(rawArgs: string): string {
  const parsed = parseArgs(rawArgs);
  if (!parsed.ok) return rawArgs;

  const value = parsed.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return JSON.stringify(value);
  }

  const sorted = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => [key, (value as Record<string, unknown>)[key]]);

  return JSON.stringify(sorted);
}

/** 同一次生成内重复调用同一个工具时复用结果，模型经常把同一个学生查两遍 */
export function createToolCache() {
  const cache = new Map<string, ToolExecution>();

  return async function runWithCache(
    name: string,
    rawArgs: string,
    deps: ToolDeps,
  ): Promise<ToolExecution> {
    const key = `${name}:${normalizeArgsKey(rawArgs)}`;
    const hit = cache.get(key);
    if (hit) return hit;

    const result = await executeTool(name, rawArgs, deps);
    if (result.ok) cache.set(key, result);
    return result;
  };
}
