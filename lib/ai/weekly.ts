// 仅服务端使用：把一周日报聚合成周报
import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { weeklyReportContentSchema } from "@/lib/schema";
import {
  SECTION_META,
  SECTION_ORDER,
  type MemoryPromptItem,
  type ReviewDraft,
  type WeeklyReportContent,
  type WeeklySourceReview,
} from "@/lib/types";
import {
  AiError,
  createClient,
  getAiModelName,
  type AiUsage,
} from "./deepseek";
import { createAbortError, isAbortError } from "./errors";
import { parseJsonValue } from "./json";

/** 单条日报各部分的上限，避免一周素材把上下文撑爆 */
const MAX_FINAL_TEXT_CHARS = 2000;
const MAX_DRAFT_TEXT_CHARS = 800;
const MAX_RAW_INPUT_CHARS = 800;
const MAX_REVIEW_BLOCK_CHARS = 3500;
const MAX_MEMORIES = 100;
const RAW_PREVIEW_CHARS = 600;

/** 兼容模型把英文 key 写成中文，或把字段换一种命名 */
const ROOT_ALIASES = {
  summary: ["summary", "本周工作总结", "工作总结"],
  metrics: ["metrics", "本周数据汇总", "数据汇总"],
  reflection: ["reflection", "本周工作心得", "工作心得"],
  nextWeek: ["nextWeek", "next_week", "下周工作安排", "下周安排"],
  supportNeeded: ["supportNeeded", "support_needed", "需要的支持", "支持需求"],
} as const;

const SUMMARY_ALIASES = {
  miantan: ["miantan", "面谈"],
  weixin: ["weixin", "微信"],
} as const;

const METRICS_ALIASES = {
  qingjia: ["qingjia", "请假"],
  yujing: ["yujing", "预警名单", "预警"],
  tingke: ["tingke", "停课名单", "停课"],
  jieke: ["jieke", "结课名单", "结课"],
  kuoke: ["kuoke", "扩科"],
  xinqian: ["xinqian", "新签"],
  xufei: ["xufei", "续费"],
} as const;

const NEXT_WEEK_ALIASES = {
  zhongdianHuifang: [
    "zhongdianHuifang",
    "zhongdian_huifang",
    "重点回访",
  ],
  jiazhanghui: ["jiazhanghui", "家长会"],
} as const;

const OUTPUT_SCHEMA = `{
  "summary": {
    "miantan": "只写日报里的面谈内容，按学员或事项分条；没有填无",
    "weixin": "只写日报里的微信沟通，按学员或事项分条；没有填无"
  },
  "metrics": {
    "qingjia": "无",
    "yujing": "无",
    "tingke": "无",
    "jieke": "无",
    "kuoke": "无",
    "xinqian": "无",
    "xufei": "无",
    "activeStudentsByGrade": "原样复制【在读学员年级及人数】"
  },
  "reflection": "2~4 条有具体落脚点的本周心得；没有填暂无",
  "nextWeek": {
    "zhongdianHuifang": "重点回访对象与事由；没有填无",
    "jiazhanghui": "家长会安排；没有填无"
  },
  "supportNeeded": "需要的支持；没有填暂无"
}`;

const WEEKLY_RULES = `你是教育培训机构学管师的周报整理助手。
你会收到一周内的日报（最终稿、栏目草稿、原始流水账）、当前有效的长期记忆，以及程序统计好的在读学员年级人数。
请把这些材料汇总成一份可以直接发给主管的周报。

【最重要的约束】
- 严禁编造任何未在【日报】或【长期记忆】里出现的信息：不新增学员姓名、不虚构人数、不虚构请假/预警/停课/结课/扩科/新签/续费/家长会等业务事件。
- 日报没有提到的数据项统一填“无”；没有求助填“暂无”。
- 只做归纳、合并和提炼，不补充材料之外的细节、金额、日期或结果。
- 不确定时宁可写得保守，也不要猜测。

【本周工作总结】
- summary.miantan：只写面谈发生的事，按学员或事项分条，每条形如“学员：沟通事项和结果”。
- summary.weixin：只写微信沟通，按学员或事项分条。
- 电话等其他明确渠道可以归入 miantan，并在条目里注明渠道。
- 两个字段都不要重复同一件事；没有就填“无”。

【本周数据汇总】
- 请假、预警名单、停课名单、结课名单、扩科、新签、续费：只从日报里提取明确写到的事件，按学员或事由列出；没有提到的填“无”。
- 不要把“跟进”“沟通”“计划”当成已经发生的业务结果。
- metrics.activeStudentsByGrade：必须原样复制【在读学员年级及人数】，不要自己计算、增删年级或改人数。

【本周工作心得】
- reflection 写 2~4 条本周复盘心得，每条要有具体落脚点（具体学员、具体动作、具体改进），不要写“要更加努力”“继续提升服务”这类空洞套话。
- 材料不足时写“暂无”，不要为了凑条数编造。

【下周工作安排】
- nextWeek.zhongdianHuifang：结合日报里未闭环的问题和【长期记忆】，列出下周重点回访的学员与事由；没有明确对象填“无”。
- nextWeek.jiazhanghui：只写日报明确提到的家长会安排；没有填“无”。

【需要的支持】
- supportNeeded：只写日报里明确提出的支持需求；没有填“暂无”。

【输出要求】
- 只输出一个 JSON 对象，字段必须完整，不要输出解释或 Markdown 代码块。
- 所有字段都是字符串，不要返回数组或对象。
- 输出 JSON 结构：
${OUTPUT_SCHEMA}`;

export type WeeklyGenerationInput = {
  weekStart: string;
  weekEnd: string;
  sourceStartDate: string;
  sourceEndDate: string;
  reviews: WeeklySourceReview[];
  memories: MemoryPromptItem[];
  activeStudentsByGrade: string;
};

function truncateChars(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : value;
}

/** 硬截断，不追加省略号，保证结果不超 schema 上限 */
function clampText(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length > max ? chars.slice(0, max).join("") : value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * 兼容模型把列表写成数组的情况；字段缺失或类型不对时使用默认值。
 * 名单类默认“无”，心得和支持默认“暂无”。
 */
function readText(value: unknown, fallback: string, max: number): string {
  if (Array.isArray(value)) {
    const joined = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .join("、");

    return clampText(joined, max) || fallback;
  }

  // 模型偶尔把数量直接写成数字，转成字符串比丢掉更准确
  if (typeof value === "number" && Number.isFinite(value)) {
    return clampText(String(value), max);
  }

  if (typeof value !== "string") return fallback;

  return clampText(value.trim(), max) || fallback;
}

function formatDraft(draft: ReviewDraft): string {
  const lines: string[] = [];

  for (const key of SECTION_ORDER) {
    const items = draft.sections?.[key] ?? [];
    if (items.length === 0) continue;
    lines.push(`${SECTION_META[key].title}：${items.join("；")}`);
  }

  return truncateChars(lines.join("\n"), MAX_DRAFT_TEXT_CHARS);
}

function formatReview(review: WeeklySourceReview): string {
  const finalText = review.finalText.trim();
  const draftText = formatDraft(review.draft);
  const rawInput = review.rawInput.trim();

  return truncateChars(
    [
      `【${review.reviewDate}】`,
      `最终稿：\n${
        finalText
          ? truncateChars(finalText, MAX_FINAL_TEXT_CHARS)
          : "（无）"
      }`,
      `栏目草稿：\n${draftText || "（无）"}`,
      `原始流水账：\n${
        rawInput ? truncateChars(rawInput, MAX_RAW_INPUT_CHARS) : "（无）"
      }`,
    ].join("\n"),
    MAX_REVIEW_BLOCK_CHARS,
  );
}

function formatMemories(memories: MemoryPromptItem[]): string {
  if (memories.length === 0) return "暂无长期记忆。";

  return memories
    .slice(0, MAX_MEMORIES)
    .map((memory) => {
      const who =
        memory.scope === "student"
          ? memory.studentName || "未关联学生"
          : "通用";
      return `- [${who}] ${memory.category}：${memory.content}`;
    })
    .join("\n");
}

function buildMessages(
  input: WeeklyGenerationInput,
): ChatCompletionMessageParam[] {
  return [
    { role: "system", content: WEEKLY_RULES },
    {
      role: "user",
      content: [
        `【周次】${input.weekStart} 至 ${input.weekEnd}`,
        `【汇总区间】${input.sourceStartDate} 至 ${input.sourceEndDate}`,
        `【在读学员年级及人数】\n<<<\n${input.activeStudentsByGrade}\n>>>`,
        `【日报】\n${input.reviews.map(formatReview).join("\n\n")}`,
        `【长期记忆】\n${formatMemories(input.memories)}`,
        "请只输出 JSON。",
      ].join("\n\n"),
    },
  ];
}

function hasRootFields(record: Record<string, unknown>): boolean {
  return Object.values(ROOT_ALIASES).some((aliases) =>
    aliases.some((key) => key in record),
  );
}

/**
 * 兼容常见包装：{ weekly_report: ... }、{ data: { ... } }、数组、
 * 以及把周报 JSON 再序列化进 content/data 字符串的情况。
 */
function findContentRecord(
  value: unknown,
  depth = 0,
): Record<string, unknown> | null {
  if (depth > 3) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findContentRecord(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof value === "string" && value.trim().startsWith("{")) {
    const parsed = parseJsonValue(value);
    if (parsed.ok) return findContentRecord(parsed.value, depth + 1);
    return null;
  }

  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  if (hasRootFields(record)) return record;

  for (const child of Object.values(record)) {
    if (child && typeof child === "object") {
      const found = findContentRecord(child, depth + 1);
      if (found) return found;
      continue;
    }

    if (typeof child === "string" && child.trim().startsWith("{")) {
      const parsed = parseJsonValue(child);
      if (parsed.ok) {
        const found = findContentRecord(parsed.value, depth + 1);
        if (found) return found;
      }
    }
  }

  return null;
}

function readAliasedObject(
  record: Record<string, unknown>,
  aliases: readonly string[],
): Record<string, unknown> {
  for (const key of aliases) {
    const value = record[key];
    const direct = asRecord(value);
    if (Object.keys(direct).length > 0) return direct;

    if (typeof value === "string" && value.trim().startsWith("{")) {
      const parsed = parseJsonValue(value);
      if (parsed.ok) {
        const nested = asRecord(parsed.value);
        if (Object.keys(nested).length > 0) return nested;
      }
    }
  }

  return {};
}

function readAliasedText(
  record: Record<string, unknown>,
  aliases: readonly string[],
  fallback: string,
  max: number,
): string {
  for (const key of aliases) {
    if (!(key in record)) continue;

    const text = readText(record[key], "", max);
    if (text) return text;
  }

  return fallback;
}

/**
 * 把模型输出清洗成完整周报结构。
 * activeStudentsByGrade 始终使用程序统计结果，避免模型算错人数。
 */
export function normalizeWeeklyReportContent(
  value: unknown,
  activeStudentsByGrade: string,
): WeeklyReportContent | null {
  const record = findContentRecord(value);
  if (!record) return null;

  const summary = readAliasedObject(record, ROOT_ALIASES.summary);
  const metrics = readAliasedObject(record, ROOT_ALIASES.metrics);
  const nextWeek = readAliasedObject(record, ROOT_ALIASES.nextWeek);

  return {
    summary: {
      miantan: readAliasedText(
        summary,
        SUMMARY_ALIASES.miantan,
        "无",
        2000,
      ),
      weixin: readAliasedText(summary, SUMMARY_ALIASES.weixin, "无", 2000),
    },
    metrics: {
      qingjia: readAliasedText(metrics, METRICS_ALIASES.qingjia, "无", 1000),
      yujing: readAliasedText(metrics, METRICS_ALIASES.yujing, "无", 1000),
      tingke: readAliasedText(metrics, METRICS_ALIASES.tingke, "无", 1000),
      jieke: readAliasedText(metrics, METRICS_ALIASES.jieke, "无", 1000),
      kuoke: readAliasedText(metrics, METRICS_ALIASES.kuoke, "无", 1000),
      xinqian: readAliasedText(metrics, METRICS_ALIASES.xinqian, "无", 1000),
      xufei: readAliasedText(metrics, METRICS_ALIASES.xufei, "无", 1000),
      activeStudentsByGrade: activeStudentsByGrade.trim() || "暂无",
    },
    reflection: readAliasedText(
      record,
      ROOT_ALIASES.reflection,
      "暂无",
      4000,
    ),
    nextWeek: {
      zhongdianHuifang: readAliasedText(
        nextWeek,
        NEXT_WEEK_ALIASES.zhongdianHuifang,
        "无",
        2000,
      ),
      jiazhanghui: readAliasedText(
        nextWeek,
        NEXT_WEEK_ALIASES.jiazhanghui,
        "无",
        2000,
      ),
    },
    supportNeeded: readAliasedText(
      record,
      ROOT_ALIASES.supportNeeded,
      "暂无",
      2000,
    ),
  };
}

export function parseWeeklyReportResponse(
  raw: string,
  activeStudentsByGrade: string,
): { content: WeeklyReportContent | null; error: string } {
  const parsed = parseJsonValue(raw);
  if (!parsed.ok) {
    return { content: null, error: parsed.error };
  }

  const content = normalizeWeeklyReportContent(
    parsed.value,
    activeStudentsByGrade,
  );
  if (!content) {
    return { content: null, error: "JSON 结构里没有周报字段" };
  }

  const result = weeklyReportContentSchema.safeParse(content);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 4)
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("；");

    return { content: null, error: `JSON 字段不符合要求：${issues}` };
  }

  return { content: result.data, error: "" };
}

type WeeklyRequestResult = {
  content: string;
  finishReason: string | null;
  completionTokens: number;
};

async function requestWeekly(input: {
  client: OpenAI;
  model: string;
  messages: ChatCompletionMessageParam[];
  temperature: number;
  signal?: AbortSignal;
  usage: AiUsage;
}): Promise<WeeklyRequestResult> {
  let completion;

  try {
    completion = await input.client.chat.completions.create(
      {
        model: input.model,
        messages: input.messages,
        temperature: input.temperature,
        max_tokens: 6000,
        response_format: { type: "json_object" },
        // 周报是整理任务，降低思考强度，避免正文被推理过程挤空
        reasoning_effort: "low",
      },
      { signal: input.signal },
    );
  } catch (error) {
    if (isAbortError(error, input.signal)) throw error;

    // 原始 SDK 错误只写服务端日志
    console.error("[ai:weekly] 请求失败", error);
    throw new AiError("周报生成服务暂时不可用，请稍后重试", "request");
  }

  if (completion.usage) {
    input.usage.promptTokens += completion.usage.prompt_tokens ?? 0;
    input.usage.completionTokens += completion.usage.completion_tokens ?? 0;
    console.info(
      `[ai:weekly] ${input.model} tokens: prompt=${completion.usage.prompt_tokens}, completion=${completion.usage.completion_tokens}`,
    );
  }

  const choice = completion.choices[0];
  const content = choice?.message?.content?.trim() ?? "";
  const finishReason = choice?.finish_reason ?? null;
  const completionTokens = completion.usage?.completion_tokens ?? 0;

  if (finishReason === "length") {
    console.warn(
      "[ai:weekly] 输出达到长度上限，可能被截断",
      "completion_tokens=",
      completionTokens,
      "usage=",
      JSON.stringify(completion.usage ?? null),
    );
  }

  if (!content) {
    console.warn(
      "[ai:weekly] 模型返回空内容，finish_reason=",
      finishReason,
      "usage=",
      JSON.stringify(completion.usage ?? null),
    );
  }

  return { content, finishReason, completionTokens };
}

function previewRaw(raw: string): string {
  const compact = raw.replace(/\s+/g, " ").trim();
  if (!compact) return "（空输出）";

  const chars = Array.from(compact);
  return chars.length > RAW_PREVIEW_CHARS
    ? `${chars.slice(0, RAW_PREVIEW_CHARS).join("")}…`
    : compact;
}

export async function generateWeeklyReport(
  input: WeeklyGenerationInput,
  options?: {
    /** 测试用：注入 OpenAI client，生产环境不传 */
    client?: OpenAI;
    /** 客户端断开时中止生成与重试 */
    signal?: AbortSignal;
    onUsage?: (usage: AiUsage) => void;
  },
): Promise<WeeklyReportContent> {
  const client = options?.client ?? createClient();
  const model = getAiModelName();
  const usage: AiUsage = {
    promptTokens: 0,
    completionTokens: 0,
    retried: false,
  };
  const messages = buildMessages(input);

  try {
    const firstResponse = await requestWeekly({
      client,
      model,
      messages,
      temperature: 0.2,
      signal: options?.signal,
      usage,
    });

    const first = parseWeeklyReportResponse(
      firstResponse.content,
      input.activeStudentsByGrade,
    );
    if (first.content) return first.content;

    if (options?.signal?.aborted) throw createAbortError();

    // 首次解析失败属于可恢复抖动，不打印正文，只留一条简短记录
    console.info(
      `[ai:weekly] 首次输出无法解析（${first.error}），自动重试一次；finish_reason=${firstResponse.finishReason ?? "unknown"}, completion_tokens=${firstResponse.completionTokens}`,
    );
    usage.retried = true;

    const retryInstruction =
      firstResponse.finishReason === "length"
        ? "上一次输出可能被截断，请压缩每条表述，优先保证 JSON 完整闭合。"
        : "请只输出修正后的完整 JSON，不要输出解释或 Markdown 代码块。";

    const retryResponse = await requestWeekly({
      client,
      model,
      temperature: 0.1,
      signal: options?.signal,
      usage,
      messages: [
        ...messages,
        {
          role: "assistant",
          content: firstResponse.content || "（空输出）",
        },
        {
          role: "user",
          content: [
            `上面的输出不能使用：${first.error}。`,
            retryInstruction,
            `字段必须严格使用下面的英文 key：\n${OUTPUT_SCHEMA}`,
          ].join("\n\n"),
        },
      ],
    });

    const second = parseWeeklyReportResponse(
      retryResponse.content,
      input.activeStudentsByGrade,
    );
    if (second.content) return second.content;

    // 两次都失败才打印原始输出预览，便于排查且不刷屏
    console.error(
      `[ai:weekly] 两次解析均失败（${second.error}），finish_reason=${retryResponse.finishReason ?? "unknown"}, completion_tokens=${retryResponse.completionTokens}，最后一次输出预览：`,
      previewRaw(retryResponse.content),
    );

    throw new AiError(
      "周报生成结果格式不对，已自动重试一次，请稍后再试",
      "output",
    );
  } finally {
    // 成功、格式失败、网络失败都把消耗上报给调用方
    options?.onUsage?.(usage);
  }
}
