// 仅服务端使用：从当天最终复盘里提取长期记忆
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { memoryExtractionSchema } from "@/lib/schema";
import type { MemoryPromptItem, Student } from "@/lib/types";
import {
  AiError,
  createClient,
  extractJson,
  getAiModelName,
  type AiUsage,
} from "./deepseek";
import { createAbortError, isAbortError } from "./errors";

const OUTPUT_SCHEMA = `{
  "memories": [
    {
      "id": "已有记忆的 id；新增填 null",
      "scope": "student",
      "studentName": "陈一鸣",
      "category": "报名续费",
      "content": "陈一鸣的数学试听课已报名，家长已交费。",
      "importance": 3
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
返回：{"memories":[{"id":null,"scope":"student","studentName":"林小满","category":"家长沟通","content":"妈妈希望每周五微信同步作业情况，重点关注数学错题。","importance":2}]}

复盘：本周继续关注学生学习状态，及时同步家长进展。
返回：{"memories":[]}（这是泛化要求，没有具体对象，不要提取）

【更新规则】
- 先逐条对照【已有记忆】。今天的信息如果和某条已有记忆是同一件事（即使措辞不同、状态变了），必须返回该条记忆的 id 和新内容，不要新增。
- 不要同时保留旧状态（例如已有“已交费”，今天变成“已续费”，要更新同一条，不要新增一条）。
- 只有确实是新事实时，id 才返回 null。

【字段规则】
- scope：有明确学生就填 student，否则 general。
- studentName：student 时填学生在【学生名单】里的名字；名单里没有的，保留复盘里出现的名字。
- category：只能是 学习习惯、成绩薄弱点、家长沟通、报名续费、课时排课、性格情绪、工作流程、长期目标、其他。
- content：不超过 60 个汉字，客观、简短、可复用，不要写“今天”。
- importance：1=一般，2=重要，3=非常重要。
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
  if (students.length === 0) return "暂无学生名单。";

  return students.map((student) => `- ${student.name}`).join("\n");
}

function parseMemories(content: string) {
  let value: unknown;

  try {
    value = JSON.parse(extractJson(content));
  } catch {
    console.error(
      "[ai:memory:parse] 不是合法 JSON:",
      content.slice(0, 800),
    );
    return { memories: null, error: "输出不是合法 JSON" };
  }

  const result = memoryExtractionSchema.safeParse(value);

  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 4)
      .map(
        (issue) =>
          `${issue.path.join(".") || "root"}: ${issue.message}`,
      )
      .join("；");

    console.error(
      "[ai:memory:parse] 字段不符合要求:",
      issues,
      content.slice(0, 800),
    );

    return { memories: null, error: `JSON 字段不符合要求：${issues}` };
  }

  return { memories: result.data.memories, error: "" };
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
  },
) {
  const client = createClient();
  const model = getAiModelName();
  const usage: AiUsage = {
    promptTokens: 0,
    completionTokens: 0,
    retried: false,
  };

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: MEMORY_RULES },
    {
      role: "user",
      content: [
        `【今天日期】${input.date}`,
        `【学生名单】\n${formatStudents(input.students)}`,
        `【已有记忆】\n${formatExistingMemories(input.existing)}`,
        `【今天的最终复盘】\n${input.finalText.trim()}`,
        "请只输出 JSON。",
      ].join("\n\n"),
    },
  ];

  let content = "";

  try {
    const completion = await client.chat.completions.create(
      {
        model,
        messages,
        temperature: 0.1,
        max_tokens: 1200,
        response_format: { type: "json_object" },
      },
      { signal: options?.signal },
    );

    content = completion.choices[0]?.message?.content?.trim() ?? "";

    if (completion.usage) {
      usage.promptTokens += completion.usage.prompt_tokens ?? 0;
      usage.completionTokens += completion.usage.completion_tokens ?? 0;
      console.info(
        `[ai:memory] ${model} tokens: prompt=${completion.usage.prompt_tokens}, completion=${completion.usage.completion_tokens}`,
      );
    }
  } catch (error) {
    if (isAbortError(error, options?.signal)) throw error;

    const message =
      error instanceof Error ? error.message : "未知错误";
    throw new AiError(`记忆整理失败：${message}`, "request");
  }

  const first = parseMemories(content);
  if (first.memories) {
    options?.onUsage?.(usage);
    return first.memories;
  }

  if (options?.signal?.aborted) throw createAbortError();

  usage.retried = true;
  const retryMessages: ChatCompletionMessageParam[] = [
    ...messages,
    { role: "assistant", content: content || "（空输出）" },
    {
      role: "user",
      content: `上面的输出不能使用：${first.error}。请只输出修正后的完整 JSON，不要输出解释或 Markdown 代码块。`,
    },
  ];

  try {
    const retry = await client.chat.completions.create(
      {
        model,
        messages: retryMessages,
        temperature: 0.1,
        max_tokens: 1200,
        response_format: { type: "json_object" },
      },
      { signal: options?.signal },
    );
    const retryContent =
      retry.choices[0]?.message?.content?.trim() ?? "";

    if (retry.usage) {
      usage.promptTokens += retry.usage.prompt_tokens ?? 0;
      usage.completionTokens += retry.usage.completion_tokens ?? 0;
    }

    const second = parseMemories(retryContent);

    if (second.memories) {
      options?.onUsage?.(usage);
      return second.memories;
    }

    throw new AiError(
      "记忆整理结果格式不对，已自动重试一次，请稍后再试",
      "output",
    );
  } catch (error) {
    if (isAbortError(error, options?.signal)) throw error;
    if (error instanceof AiError) throw error;
    const message =
      error instanceof Error ? error.message : "未知错误";
    throw new AiError(`记忆整理重试失败：${message}`, "request");
  }
}
