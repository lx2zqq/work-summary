import {
  MAX_DAILY_PHRASE_LENGTH,
  MIN_DAILY_PHRASE_LENGTH,
} from "./daily-phrase";
import { normalizeItem } from "./template";
import {
  MAX_QUESTIONS_PER_ROUND,
  SECTION_ORDER,
  emptySections,
  hasDraftContent,
  type FollowUpQuestion,
  type ReviewDraft,
  type SectionKey,
} from "./types";

const MAX_ITEMS_PER_SECTION = 30;
const MAX_QUESTIONS = MAX_QUESTIONS_PER_ROUND;
const MAX_NOTES = 3;

/** 生成和保存共用同一口径，只统计栏目正文，避免模板标题/emoji 被算成编辑改动 */
export function countDraftItems(draft: ReviewDraft): number {
  return Object.values(draft.sections).reduce(
    (total, items) => total + items.length,
    0,
  );
}

export function countDraftChars(draft: ReviewDraft): number {
  return Object.values(draft.sections)
    .flat()
    .reduce((total, item) => total + item.length, 0);
}

type DraftLike = {
  sections?: Partial<Record<SectionKey, string[]>>;
  dailyPhrase?: string | null;
  questions?: Array<{
    id?: string;
    text: string;
    options?: string[];
    multiple?: boolean;
    target?: SectionKey | "general";
    reason?: string;
  }>;
  notes?: string[];
};

function uniqueClean(items: string[] | undefined): string[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of items) {
    if (typeof raw !== "string") continue;
    const item = normalizeItem(raw);
    if (!item) continue;
    const key = item.replace(/[\s，。！？、；：""''（）()]/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

/** 清理 AI 生成的话术；过短视为无效，交给固定库兜底 */
function normalizeDailyPhrase(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const phrase = normalizeItem(value).slice(0, MAX_DAILY_PHRASE_LENGTH);
  return phrase.length >= MIN_DAILY_PHRASE_LENGTH ? phrase : undefined;
}

/** 把模型输出或数据库里的草稿整理成稳定结构 */
export function normalizeDraft(
  input: DraftLike | null | undefined,
  options: { maxQuestions?: number } = {},
): ReviewDraft {
  const maxQuestions = options.maxQuestions ?? MAX_QUESTIONS;
  const sourceSections = input?.sections ?? {};
  const sections = emptySections();

  for (const key of SECTION_ORDER) {
    sections[key] = uniqueClean(sourceSections[key]).slice(
      0,
      MAX_ITEMS_PER_SECTION,
    );
  }

  const questions: FollowUpQuestion[] = [];
  const seenQuestions = new Set<string>();
  const usedIds = new Set<string>();

  for (const [index, question] of (input?.questions ?? []).entries()) {
    const text = question.text?.trim();
    if (!text || seenQuestions.has(text)) continue;
    seenQuestions.add(text);

    const options = (question.options ?? [])
      .map((option) => (typeof option === "string" ? option.trim() : ""))
      .filter(Boolean)
      .slice(0, 4);

    let id = question.id?.trim() || `q${index + 1}`;
    while (usedIds.has(id)) {
      id = `${id}-${index + 1}`;
    }
    usedIds.add(id);

    questions.push({
      id,
      text,
      options,
      multiple: question.multiple === true,
      target: question.target ?? "general",
      reason: question.reason?.trim() || undefined,
    });
  }

  return {
    sections,
    dailyPhrase: normalizeDailyPhrase(input?.dailyPhrase),
    questions: questions.slice(0, maxQuestions),
    notes: uniqueClean(input?.notes).slice(0, MAX_NOTES),
  };
}

/**
 * 追问阶段只替换问题，保留当前正文。
 * 手动重新生成会重置追问周期，但不能把之前写好的正文清空。
 */
export function mergeFollowUpDraft(
  current: ReviewDraft,
  incoming: ReviewDraft,
): ReviewDraft {
  return {
    ...incoming,
    sections: hasDraftContent(current) ? current.sections : incoming.sections,
    dailyPhrase: current.dailyPhrase ?? incoming.dailyPhrase,
  };
}

/** AI 不可用时的兜底：把原文按句号/分号/换行拆成学情跟进 */
export function fallbackDraft(rawInput: string): ReviewDraft {
  const parts = rawInput
    .split(/[\n。；;]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((part) => part.slice(0, 600));

  const sections = emptySections();
  sections.xueqing =
    parts.length > 0 ? parts : [rawInput.trim().slice(0, 600)].filter(Boolean);

  return {
    sections,
    questions: [],
    notes: ["生成服务暂时没有连上，已按原文生成草稿，请手动调整。"],
  };
}
