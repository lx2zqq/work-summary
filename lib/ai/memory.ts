// 仅服务端使用：从当天最终复盘里提取长期记忆
import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { normalizeMemoryText } from "@/lib/memory";
import {
  memoryExtractionSchema,
  type ExtractedMemory,
} from "@/lib/schema";
import {
  MEMORY_CATEGORIES,
  MEMORY_MAX_TTL_DAYS,
  type MemoryCategory,
  type MemoryLifecycle,
  type MemoryPromptItem,
  type MemoryScope,
  type Student,
} from "@/lib/types";
import {
  AiError,
  createClient,
  getAiModelName,
  type AiUsage,
} from "./deepseek";
import { createAbortError, isAbortError } from "./errors";
import { parseJsonValue } from "./json";

/** 单次送进模型的复盘正文上限，避免超长流水账挤占上下文 */
const MAX_FINAL_TEXT_CHARS = 6000;
/** 学生名单最多带多少个名字 */
const MAX_STUDENT_NAMES = 200;
/** 单次解析最多保留多少条记忆，与 schema 上限保持一致 */
const MAX_EXTRACTED_MEMORIES = 10;
const MAX_MEMORY_CONTENT_CHARS = 300;
const MAX_STUDENT_NAME_CHARS = 20;
/** 两次解析都失败时，服务端日志里最多保留多少字符的原始输出 */
const RAW_PREVIEW_CHARS = 600;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const OUTPUT_SCHEMA = `{
  "memories": [
    {
      "id": "已有记忆的 id；新增填 null",
      "scope": "student",
      "studentName": "陈一鸣",
      "category": "报名续费",
      "content": "陈一鸣的数学试听课已报名，家长已交费。",
      "importance": 3,
      "lifecycle": "permanent",
      "ttlDays": null
    }
  ]
}`;

const MEMORY_RULES = `你是“学管部工作复盘”的长期记忆整理助手，服务对象是教育培训机构的学管师。
你的任务：从今天的最终复盘里，提取以后写复盘时还会用到的关键事实，写成简短、客观、可复用的记忆。

【只提取长期有效的信息】
- 只保留针对具体学生或校区的客观事实：薄弱知识点、学习习惯、家长沟通偏好、明确顾虑、报名/续费/排课状态等。
- 学生：性格与情绪特点、课时进度、重要承诺、长期目标。
- 通用：校区流程/规定、反复出现的问题、有效的工作方法、长期目标。

【不要提取】
- 当天的一次性动作：发通知、打印资料、临时排课、某次错题录入等，除非它形成了长期规则或结论。
- 泛化的学管工作要求，例如“需持续关注”“需跟进落实”“需同步家长进展/课后任务/配合建议”等；除非原文写明了具体学生、学科、事项或时间。
- 固定话术、服务理念、空泛反思。
- 猜测、未确认的信息、临时情绪。
- 已经在【已有记忆】里且没有变化的内容。

【示例】
复盘：林小满妈妈希望每周五微信同步一次作业完成情况，她更关注数学错题。
返回：{"memories":[{"id":null,"scope":"student","studentName":"林小满","category":"家长沟通","content":"妈妈希望每周五微信同步作业情况，重点关注数学错题。","importance":2,"lifecycle":"permanent"}]}

复盘：陈一鸣周六下午的数学课临时调到周日上午，已经跟家长确认。
返回：{"memories":[{"id":null,"scope":"student","studentName":"陈一鸣","category":"课时排课","content":"周六数学课临时调到周日上午。","importance":2,"lifecycle":"ephemeral","ttlDays":7}]}

复盘：本周继续关注学生学习状态，及时同步家长进展。
返回：{"memories":[]}（这是泛化要求，没有具体对象，不要提取）

【更新规则】
- 先逐条对照【已有记忆】。今天的信息如果和某条已有记忆是同一件事（即使措辞不同、状态变了），必须返回该条记忆的 id 和新内容，不要新增。
- 不要同时保留旧状态（例如已有“已交费”，今天变成“已续费”，要更新同一条，不要新增一条）。
- 只有确实是新事实时，id 才返回 null。

【生命周期】
- lifecycle=permanent：长期有效。学生性格、学习习惯、薄弱学科规律、家长长期沟通偏好、校区固定流程、长期目标。
- lifecycle=ephemeral：阶段性有效。本周待办、某次具体考试/活动/补课安排、临时请假、单次跟进事项。
- ttlDays：仅 ephemeral 时填写建议有效天数，可取 3、7、14，默认 7；permanent 填 null 或不填。
- 判断不准时选 permanent，避免把长期信息误归档。

【字段规则】
- scope：有明确学生就填 student，否则 general。
- studentName：student 时填学生在【学生名单】里的名字；名单里没有的，保留复盘里出现的名字。
- category：只能是 学习习惯、成绩薄弱点、家长沟通、报名续费、课时排课、性格情绪、工作流程、长期目标、其他。
- content：不超过 60 个汉字，客观、简短、可复用，不要写“今天”。
- importance：1=一般，2=重要，3=非常重要。
- lifecycle：permanent 或 ephemeral，按上面的生命周期规则判断。
- ttlDays：ephemeral 时给建议有效天数，permanent 填 null。
- 最多 8 条；没有值得记的就返回空数组。
- 只输出 JSON，不要解释、不要 Markdown 代码块。

【输出 JSON 结构】
${OUTPUT_SCHEMA}`;

function formatExistingMemories(memories: MemoryPromptItem[]): string {
  if (memories.length === 0) return "暂无已有记忆。";

  return memories
    .map((memory) => {
      const who =
        memory.scope === "student"
          ? memory.studentName || "未关联学生"
          : "通用";
      return `- id=${memory.id} | [${who}] | ${memory.category} | ${memory.content} | 重要度 ${memory.importance}`;
    })
    .join("\n");
}

function formatStudents(students: Student[]): string {
  const names = students
    .slice(0, MAX_STUDENT_NAMES)
    .map((student) => student.name);

  if (names.length === 0) return "暂无学生名单。";

  return names.map((name) => `- ${name}`).join("\n");
}

/** 按码点截断，避免把 emoji 之类的代理对切成半个字符 */
function truncateChars(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : value;
}

/** 硬截断，不追加省略号，保证结果不超长 */
function clampText(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length > max ? chars.slice(0, max).join("") : value;
}

function memoryKey(
  scope: string,
  studentName: string | null | undefined,
  content: string,
): string {
  return `${scope}|${(studentName ?? "").trim()}|${normalizeMemoryText(content)}`;
}

/** 同一批次内去重，并排除与已有记忆完全重复的条目 */
function dedupeExtracted(
  items: ExtractedMemory[],
  existing: MemoryPromptItem[],
): ExtractedMemory[] {
  const seen = new Set<string>();
  const existingKeys = new Set(
    existing.map((memory) =>
      memoryKey(memory.scope, memory.studentName, memory.content),
    ),
  );
  const result: ExtractedMemory[] = [];

  for (const item of items) {
    const key = memoryKey(item.scope, item.studentName, item.content);

    if (seen.has(key) || existingKeys.has(key)) continue;

    seen.add(key);
    result.push(item);
  }

  return result;
}

/** 兼容 { memories: [] }、裸数组、单条对象和 items/data 包装 */
function readMemoryArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;

  for (const key of ["memories", "items", "data"]) {
    const candidate = record[key];
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === "object") return [candidate];
  }

  // 模型直接返回了一条记忆
  if ("content" in record) return [record];

  return null;
}

const CATEGORY_KEYWORDS: Array<[MemoryCategory, RegExp]> = [
  ["学习习惯", /学习|习惯|作业|错题|订正|自习/],
  ["成绩薄弱点", /成绩|薄弱|分数|提分|学科|数学|英语|物理|化学|语文/],
  ["家长沟通", /家长|沟通|妈妈|爸爸|微信|电话|面谈/],
  ["报名续费", /报名|续费|交费|缴费|签单|试听|转介绍/],
  ["课时排课", /课时|排课|课表|补课|请假|到课|缺课/],
  ["性格情绪", /性格|情绪|内向|外向|焦虑|状态/],
  ["工作流程", /流程|规定|校区|工作|规范|通知/],
  ["长期目标", /目标|长期|规划|计划/],
];

function normalizeCategory(value: unknown): MemoryCategory {
  const text = typeof value === "string" ? value.trim() : "";
  const exact = MEMORY_CATEGORIES.find((item) => item === text);
  if (exact) return exact;

  if (text) {
    const matched = CATEGORY_KEYWORDS.find(([, pattern]) =>
      pattern.test(text),
    );
    if (matched) return matched[0];
  }

  return "其他";
}

function normalizeImportance(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(3, Math.max(1, Math.round(value)));
  }

  if (typeof value === "string") {
    const text = value.trim();
    const numeric = Number(text);

    if (text && Number.isFinite(numeric)) {
      return Math.min(3, Math.max(1, Math.round(numeric)));
    }

    if (/高|很重要|非常重要|紧急/.test(text)) return 3;
    if (/低|一般|普通/.test(text)) return 1;
  }

  return 2;
}

function normalizeScope(value: unknown, studentName: string): MemoryScope {
  if (value === "student" || value === "general") return value;
  return studentName ? "student" : "general";
}

function normalizeId(value: unknown): string | null {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}

function normalizeTtlDays(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(MEMORY_MAX_TTL_DAYS, Math.max(1, Math.round(value)));
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return Math.min(MEMORY_MAX_TTL_DAYS, Math.max(1, Math.round(parsed)));
    }
  }

  return undefined;
}

function normalizeLifecycle(
  value: unknown,
  ttlDays: number | undefined,
): MemoryLifecycle {
  if (value === "ephemeral") return "ephemeral";
  if (value === "permanent") return "permanent";

  // 字段缺失但给了有效天数时，按阶段性记忆处理更符合模型意图
  return ttlDays !== undefined ? "ephemeral" : "permanent";
}

function normalizeExtractedItem(value: unknown): ExtractedMemory | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const content =
    typeof record.content === "string" ? record.content.trim() : "";

  if (!content) return null;

  const studentName =
    typeof record.studentName === "string"
      ? clampText(record.studentName.trim(), MAX_STUDENT_NAME_CHARS)
      : "";
  const scope = normalizeScope(record.scope, studentName);

  if (scope === "student" && !studentName) return null;

  const ttlDays = normalizeTtlDays(record.ttlDays);
  const lifecycle = normalizeLifecycle(record.lifecycle, ttlDays);

  return {
    id: normalizeId(record.id),
    scope,
    studentName: scope === "student" ? studentName : null,
    category: normalizeCategory(record.category),
    content: clampText(content, MAX_MEMORY_CONTENT_CHARS),
    importance: normalizeImportance(record.importance),
    lifecycle,
    ...(lifecycle === "ephemeral" && ttlDays !== undefined
      ? { ttlDays }
      : {}),
  };
}

/**
 * 容错解析记忆提取结果。
 * 模型偶尔会返回裸数组、带 Markdown 围栏、字段漂移或单条坏数据，
 * 这里统一清洗，避免一条字段异常让整批记忆失败。
 */
export function parseMemoryExtractResponse(raw: string): {
  memories: ExtractedMemory[] | null;
  error: string;
} {
  const parsed = parseJsonValue(raw);
  if (!parsed.ok) return { memories: null, error: parsed.error };

  const items = readMemoryArray(parsed.value);
  if (!items) {
    return { memories: null, error: "JSON 结构里没有记忆数组" };
  }

  const memories: ExtractedMemory[] = [];

  for (const item of items) {
    const normalized = normalizeExtractedItem(item);
    if (normalized) memories.push(normalized);
    if (memories.length >= MAX_EXTRACTED_MEMORIES) break;
  }

  const result = memoryExtractionSchema.safeParse({ memories });
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("；");

    return { memories: null, error: `JSON 字段不符合要求：${issues}` };
  }

  return { memories: result.data.memories, error: "" };
}

/** 日志里只保留压缩后的截断预览，避免把整段学生信息刷进日志 */
function previewRaw(raw: string): string {
  const compact = raw.replace(/\s+/g, " ").trim();
  if (!compact) return "（空输出）";

  const chars = Array.from(compact);
  return chars.length > RAW_PREVIEW_CHARS
    ? `${chars.slice(0, RAW_PREVIEW_CHARS).join("")}…`
    : compact;
}

async function requestMemories(input: {
  client: OpenAI;
  model: string;
  messages: ChatCompletionMessageParam[];
  signal?: AbortSignal;
  usage: AiUsage;
}): Promise<string> {
  try {
    const completion = await input.client.chat.completions.create(
      {
        model: input.model,
        messages: input.messages,
        temperature: 0.1,
        max_tokens: 1200,
        response_format: { type: "json_object" },
      },
      { signal: input.signal },
    );

    const content = completion.choices[0]?.message?.content?.trim() ?? "";

    if (completion.usage) {
      input.usage.promptTokens += completion.usage.prompt_tokens ?? 0;
      input.usage.completionTokens += completion.usage.completion_tokens ?? 0;
      console.info(
        `[ai:memory] ${input.model} tokens: prompt=${completion.usage.prompt_tokens}, completion=${completion.usage.completion_tokens}`,
      );
    }

    return content;
  } catch (error) {
    if (isAbortError(error, input.signal)) throw error;

    // 原始 SDK 错误只写服务端日志
    console.error("[ai:memory] 请求失败", error);
    throw new AiError("记忆整理服务暂时不可用，请稍后重试", "request");
  }
}

export async function extractMemories(
  input: {
    date: string;
    finalText: string;
    students: Student[];
    existing: MemoryPromptItem[];
  },
  options?: {
    onUsage?: (usage: AiUsage) => void;
    /** 客户端断开时中止提取与重试 */
    signal?: AbortSignal;
    /** 测试用：注入 OpenAI client，生产环境不传 */
    client?: OpenAI;
  },
) {
  const client = options?.client ?? createClient();
  const model = getAiModelName();
  const usage: AiUsage = {
    promptTokens: 0,
    completionTokens: 0,
    retried: false,
  };

  const finalText = truncateChars(
    input.finalText.trim(),
    MAX_FINAL_TEXT_CHARS,
  );

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: MEMORY_RULES },
    {
      role: "user",
      content: [
        `【今天日期】${input.date}`,
        `【学生名单】\n${formatStudents(input.students)}`,
        `【已有记忆】\n${formatExistingMemories(input.existing)}`,
        `【今天的最终复盘】\n<<<\n${finalText}\n>>>`,
        "请只输出 JSON。",
      ].join("\n\n"),
    },
  ];

  try {
    const content = await requestMemories({
      client,
      model,
      messages,
      signal: options?.signal,
      usage,
    });

    const first = parseMemoryExtractResponse(content);
    if (first.memories) {
      return dedupeExtracted(first.memories, input.existing);
    }

    if (options?.signal?.aborted) throw createAbortError();

    // 首次解析失败属于可恢复抖动，不打印正文，只留一条简短记录
    console.info(
      `[ai:memory] 首次输出无法解析（${first.error}），自动重试一次`,
    );
    usage.retried = true;

    const retryContent = await requestMemories({
      client,
      model,
      signal: options?.signal,
      usage,
      messages: [
        ...messages,
        { role: "assistant", content: content || "（空输出）" },
        {
          role: "user",
          content: `上面的输出不能使用：${first.error}。请只输出修正后的完整 JSON，不要输出解释或 Markdown 代码块。`,
        },
      ],
    });

    const second = parseMemoryExtractResponse(retryContent);

    if (second.memories) {
      return dedupeExtracted(second.memories, input.existing);
    }

    // 两次都失败才打印原始输出预览，便于排查且不刷屏
    console.error(
      `[ai:memory] 两次解析均失败（${second.error}），最后一次输出预览：`,
      previewRaw(retryContent),
    );

    throw new AiError(
      "记忆整理结果格式不对，已自动重试一次，请稍后再试",
      "output",
    );
  } finally {
    // 成功、格式失败、网络失败都上报，避免统计漏掉重试消耗的 token
    options?.onUsage?.(usage);
  }
}
