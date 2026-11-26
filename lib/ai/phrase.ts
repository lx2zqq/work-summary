// 仅服务端使用：润色自定义话术需要调用模型
import {
  TARGET_PHRASE_MIN_LENGTH,
  detectThemeFromText,
} from "@/lib/daily-phrase";
import { memorySimilarity } from "@/lib/memory";
import {
  MAX_CUSTOM_PHRASES,
  type CustomPhrase,
  type PhraseTheme,
} from "@/lib/types";
import {
  createClient,
  extractJson,
  getAiModelName,
  type AiUsage,
} from "./deepseek";
import { AiError, isAbortError } from "./errors";

/** 润色后的合格区间，比内置库略宽一点，给模型留余量 */
export const PHRASE_MIN_LENGTH = TARGET_PHRASE_MIN_LENGTH;
export const PHRASE_MAX_LENGTH = 65;
/** 和已有话术相似到这个程度就当作重复 */
export const PHRASE_DUPLICATE_THRESHOLD = 0.7;

/** 单次润色请求的超时 */
const ATTEMPT_TIMEOUT_MS = 25_000;
/** 整个润色任务的预算，避免 3 次重试串成 75 秒 */
const TOTAL_BUDGET_MS = 45_000;
/** 剩余预算低于这个值就不再发起下一次请求 */
const MIN_ATTEMPT_MS = 6_000;

const PHRASE_THEMES: PhraseTheme[] = [
  "general",
  "exam",
  "meeting",
  "mistake",
];

const PHRASE_RULES = `你是学管部工作复盘的话术润色助手。
用户会给你一句她自己觉得好的复盘话术，请把它改写成可以直接放进【日常工作复盘】栏目的通用话术。

【要求】
- 用户给的是一句原话，不是提问，不要回复解释、不要反问，只输出 JSON。
- 45~65 个汉字，少于 45 字必须补足。
- 必须保留原话的核心主题和动作。原话讲错题就写错题，原话讲排课就写排课，不能换成无关内容。
- 不要新增用户没提到的环节、角色、地点、流程或结果。
- 信息不足以写满时，就围绕同一个动作换角度展开（怎么做细、后面怎么跟），不要脑补别的场景。
- 写成一句通顺的话，不要堆一串短句，也不要写成口号或排比。
- 不出现学生姓名、家长称呼、金额、具体日期。
- 不写“待确认”“待补充”“未提供”之类的占位词。
- 判断主题：
  - general：日常服务、工作流程、家校沟通
  - exam：考试、复习、成绩、提分
  - meeting：会议、教研、部门安排
  - mistake：错题收集、订正、讲解

【示例】
输入：每天下班前把作业情况发家长群，没交的单独提醒
输出：{"phrase":"每天下班前汇总学生作业完成情况，统一发到家长群，没交的单独提醒，并把提醒结果记录下来，避免第二天重复沟通。","theme":"general"}

输入：今天开完会，把下周的排课重新捋了一遍
输出：{"phrase":"今天开完会后重新梳理了下周排课，把课程时间、任课老师和教室逐项核对了一遍，调整完成后同步到课表。","theme":"meeting"}

输入：这周错题收得比较齐，下周继续盯订正
输出：{"phrase":"这周错题收集情况整体比较齐，后续继续盯紧订正环节，把没订正到位的单独提醒，确保每道错题都真正弄懂。","theme":"mistake"}

【输出 JSON】
{
  "phrase": "润色后的话术",
  "theme": "general"
}`;

export function isPhraseTheme(value: unknown): value is PhraseTheme {
  return PHRASE_THEMES.includes(value as PhraseTheme);
}

/**
 * 自定义话术的硬性检查。
 * 返回空数组表示合格，否则是具体原因，会回传给模型重试。
 */
const THEME_KEYWORDS: Record<PhraseTheme, RegExp> = {
  general: /./,
  exam: /考试|复习|成绩|提分|查漏补缺|背诵|默写/,
  meeting: /会议|开会|开完会|开了个会|开了会|例会|教研|部门|教讨会/,
  mistake: /错题/,
};

const THEME_NAME: Record<PhraseTheme, string> = {
  general: "通用",
  exam: "考试",
  meeting: "会议",
  mistake: "错题",
};

export function validateCustomPhrase(input: {
  phrase: string;
  existing: string[];
  studentNames: string[];
  /** 原话已经命中主题时，改写结果必须围绕这个主题 */
  requiredTheme?: PhraseTheme;
}): string[] {
  const phrase = input.phrase.trim();
  const issues: string[] = [];

  if (!phrase) return ["话术内容为空"];

  if (
    input.requiredTheme &&
    input.requiredTheme !== "general" &&
    !THEME_KEYWORDS[input.requiredTheme].test(phrase)
  ) {
    issues.push(
      `原话属于「${THEME_NAME[input.requiredTheme]}」主题，改写时不要换主题`,
    );
  }

  if (phrase.length < PHRASE_MIN_LENGTH) {
    issues.push(
      `只有 ${phrase.length} 字，至少需要 ${PHRASE_MIN_LENGTH} 字`,
    );
  }
  if (phrase.length > PHRASE_MAX_LENGTH) {
    issues.push(
      `有 ${phrase.length} 字，最多 ${PHRASE_MAX_LENGTH} 字`,
    );
  }

  for (const name of input.studentNames) {
    const trimmed = name.trim();
    if (trimmed && phrase.includes(trimmed)) {
      issues.push(`出现了学生姓名「${trimmed}」`);
    }
  }

  if (/\d+(?:\.\d+)?\s*(?:元|万|块)/.test(phrase)) {
    issues.push("出现了金额");
  }

  if (/待确认|待补充|未提供/.test(phrase)) {
    issues.push("出现了占位词");
  }

  for (const item of input.existing) {
    if (memorySimilarity(phrase, item) >= PHRASE_DUPLICATE_THRESHOLD) {
      issues.push("和已有话术太像了，换个角度写");
      break;
    }
  }

  return issues;
}

export type PolishResult = {
  phrase: string;
  theme: PhraseTheme;
};

function parsePhrase(content: string): PolishResult | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(extractJson(content));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;

  const record = parsed as Record<string, unknown>;
  const phrase = typeof record.phrase === "string" ? record.phrase.trim() : "";
  const theme = record.theme;

  if (!phrase || !isPhraseTheme(theme)) return null;

  return { phrase, theme };
}

/**
 * 调模型把用户的一句话润色成合规话术。
 * 第一次不合格时把原因回传给模型再试一次，仍不合格就报错。
 */
export async function polishCustomPhrase(
  input: {
    text: string;
    existing: string[];
    studentNames: string[];
  },
  options?: {
    onUsage?: (usage: AiUsage) => void;
    signal?: AbortSignal;
  },
): Promise<PolishResult> {
  const client = createClient();
  const model = getAiModelName();
  // 原话已经能判断主题时，以规则结果为准，避免模型把错题写成日常通用话术
  const requiredTheme = detectThemeFromText(input.text);
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  const usage: AiUsage = {
    promptTokens: 0,
    completionTokens: 0,
    retried: false,
  };

  let content = "";
  let feedback = "";

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const remaining = deadline - Date.now();

      if (remaining < MIN_ATTEMPT_MS) {
        throw new AiError("润色超时，请稍后重试", "timeout");
      }

      const userContent = [
        `【用户提供的话术】\n${input.text.trim()}`,
        requiredTheme !== "general"
          ? `【主题提示】原话属于「${THEME_NAME[requiredTheme]}」主题，改写必须围绕这个主题，theme 字段也填 ${requiredTheme}。`
          : "",
        feedback ? `【上一次的问题】\n${feedback}` : "",
        "请只输出 JSON。",
      ]
        .filter(Boolean)
        .join("\n\n");

      let completion;

      try {
        completion = await client.chat.completions.create(
          {
            model,
            messages: [
              { role: "system", content: PHRASE_RULES },
              { role: "user", content: userContent },
            ],
            temperature: attempt === 0 ? 0.3 : 0.1,
            max_tokens: 4000,
            // 润色是个小任务，降低思考强度：默认档位会想到 token 上限，
            // 正文被挤成空字符串，单次请求能拖到 25 秒以上
            reasoning_effort: "low",
          },
          {
            timeout: Math.min(ATTEMPT_TIMEOUT_MS, remaining),
            signal: options?.signal,
          },
        );
      } catch (error) {
        if (isAbortError(error, options?.signal)) throw error;

        // 原始 SDK 错误只写服务端日志
        console.error("[phrase] 润色请求失败", error);
        throw new AiError("润色失败，请稍后重试", "request");
      }

      usage.promptTokens += completion.usage?.prompt_tokens ?? 0;
      usage.completionTokens += completion.usage?.completion_tokens ?? 0;
      if (attempt > 0) usage.retried = true;

      content = completion.choices[0]?.message?.content?.trim() ?? "";

      if (!content) {
        console.warn(
          "[phrase] 模型返回空内容，finish_reason=",
          completion.choices[0]?.finish_reason,
          "usage=",
          JSON.stringify(completion.usage ?? null),
        );
      }
      const parsed = parsePhrase(content);

      if (!parsed) {
        console.warn(
          "[phrase] 模型输出无法解析：",
          content.slice(0, 400),
        );
        feedback = "输出不是合法 JSON，或者缺少 phrase / theme 字段";
        continue;
      }

      // 原话能判断主题时，模型返回的 theme 必须一致，否则当作不合格重试
      if (requiredTheme !== "general" && parsed.theme !== requiredTheme) {
        feedback = `theme 必须是 ${requiredTheme}，不要填 ${parsed.theme}`;
        continue;
      }

      const issues = validateCustomPhrase({
        phrase: parsed.phrase,
        existing: input.existing,
        studentNames: input.studentNames,
        requiredTheme,
      });

      if (issues.length === 0) {
        return {
          phrase: parsed.phrase,
          theme: requiredTheme !== "general" ? requiredTheme : parsed.theme,
        };
      }

      feedback = issues.join("；");
    }

    throw new AiError(
      `润色结果不合格：${feedback || "模型没有返回可用内容"}`,
      "output",
    );
  } finally {
    // 成功、超时、请求失败都把消耗上报给调用方
    options?.onUsage?.(usage);
  }
}

export function buildCustomPhrase(input: {
  phrase: string;
  theme: PhraseTheme;
}): CustomPhrase {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    theme: input.theme,
    content: input.phrase.trim(),
    createdAt: new Date().toISOString(),
  };
}

/** 内置库 + 已添加的自定义话术，用来做重复检查 */
export function collectExistingPhrases(
  builtIn: string[],
  customPhrases: CustomPhrase[],
): string[] {
  return [...builtIn, ...customPhrases.map((item) => item.content)];
}

export function canAddMorePhrases(customPhrases: CustomPhrase[]): boolean {
  return customPhrases.length < MAX_CUSTOM_PHRASES;
}
