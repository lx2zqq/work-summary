// 追问答案的纯状态逻辑，方便单测，也避免组件里状态互相覆盖。

import {
  AI_SKIP_ANSWER,
  type FollowUpQuestion,
  type QAPair,
} from "./types";

export type QuestionAnswer = {
  selected: string[];
  custom: string;
  /** 日常复盘追问被用户跳过，交给 AI 结合当天工作提炼 */
  aiSkip?: boolean;
};

export const EMPTY_ANSWER: QuestionAnswer = {
  selected: [],
  custom: "",
};

/** 标记日常复盘追问为“跳过，由 AI 提炼” */
export function setAnswerSkip(current: QuestionAnswer): QuestionAnswer {
  return { ...current, aiSkip: true };
}

/** 撤销跳过，保留用户之前输入的内容 */
export function clearAnswerSkip(current: QuestionAnswer): QuestionAnswer {
  return { ...current, aiSkip: false };
}

/** 只有日常复盘追问允许“跳过，由 AI 提炼”，其他追问一律不允许 */
export function isRichangQuestion(
  question: Pick<FollowUpQuestion, "section">,
): boolean {
  return question.section === "richang";
}

export function toggleAnswerOption(
  current: QuestionAnswer,
  option: string,
  multiple: boolean,
): QuestionAnswer {
  if (multiple) {
    const selected = current.selected.includes(option)
      ? current.selected.filter((item) => item !== option)
      : [...current.selected, option];

    return { ...current, selected };
  }

  // 单选：再次点击已选项可以取消；选其他选项时替换，补充内容始终保留
  const selected =
    current.selected.length === 1 && current.selected[0] === option
      ? []
      : [option];

  return { ...current, selected };
}

export function setAnswerCustom(
  current: QuestionAnswer,
  value: string,
): QuestionAnswer {
  // 输入补充时保留已选选项，选项和补充可以同时存在
  return { ...current, custom: value };
}

/** 选项和自定义补充之间的分隔标记 */
const CUSTOM_MARKER = "；补充：";

export function buildAnswer(state: QuestionAnswer): string {
  // 跳过状态优先：即使之前填过内容，也按明确标记提交
  if (state.aiSkip) return AI_SKIP_ANSWER;

  const custom = state.custom.trim();

  if (state.selected.length === 0) {
    return custom;
  }

  const selected = state.selected.join("、");
  return custom ? `${selected}${CUSTOM_MARKER}${custom}` : selected;
}

type ParsedSelected = {
  selected: string[];
  /** 选项部分是否完全由已知选项组成 */
  matchedAll: boolean;
  /** 已经消费掉的字符数，包含分隔用的顿号 */
  consumedLength: number;
};

/**
 * 按已知选项解析选项部分。
 * 选项本身可能带顿号，所以先整体匹配，再按长度从长到短贪心匹配，
 * 不能直接 split("、")，否则会把一个选项拆成两半。
 */
function parseSelected(part: string, options: string[]): ParsedSelected {
  const trimmed = part.trim();
  if (!trimmed) return { selected: [], matchedAll: true, consumedLength: 0 };

  if (options.includes(trimmed)) {
    return {
      selected: [trimmed],
      matchedAll: true,
      consumedLength: trimmed.length,
    };
  }

  const sorted = [...options].sort((a, b) => b.length - a.length);
  const selected: string[] = [];
  let rest = trimmed;
  let consumed = 0;

  while (rest.length > 0) {
    const hit = sorted.find(
      (option) => rest === option || rest.startsWith(`${option}、`),
    );
    if (!hit) break;

    selected.push(hit);
    consumed += hit.length;
    rest = rest.slice(hit.length);

    if (rest.startsWith("、")) {
      rest = rest.slice(1);
      consumed += 1;
    }
  }

  return { selected, matchedAll: rest.length === 0, consumedLength: consumed };
}

/**
 * 解析一条已提交的答案。
 * 只有“；补充：”前面的内容完全由已知选项组成时，它才是安全边界；
 * 否则说明标记本身属于用户补充内容，必须整段保留，避免自定义内容被截断丢弃。
 */
function parseStoredAnswer(answer: string, options: string[]): QuestionAnswer {
  const trimmed = answer.trim();
  if (!trimmed) return { selected: [], custom: "" };

  // 生成失败重试时还原跳过状态，而不是把标记当成用户手写内容
  if (trimmed === AI_SKIP_ANSWER) {
    return { selected: [], custom: "", aiSkip: true };
  }

  const markerIndex = trimmed.indexOf(CUSTOM_MARKER);

  if (markerIndex >= 0) {
    const parsed = parseSelected(trimmed.slice(0, markerIndex), options);

    if (parsed.matchedAll && parsed.selected.length > 0) {
      return {
        selected: parsed.selected,
        custom: trimmed.slice(markerIndex + CUSTOM_MARKER.length).trim(),
      };
    }
  }

  const parsed = parseSelected(trimmed, options);

  if (parsed.selected.length > 0) {
    const tail = trimmed.slice(parsed.consumedLength);
    return {
      selected: parsed.selected,
      custom: tail.replace(/^[；;、\s]+/, "").trim(),
    };
  }

  return { selected: [], custom: trimmed };
}

/**
 * 从已提交的问答里还原追问表单。
 * 生成失败重试时，把用户之前选的选项和补充内容填回去。
 */
export function answersFromConversation(
  questions: FollowUpQuestion[],
  conversation: QAPair[],
): Record<string, QuestionAnswer> {
  const result: Record<string, QuestionAnswer> = {};

  for (const question of questions) {
    let pair: QAPair | undefined;

    for (let index = conversation.length - 1; index >= 0; index -= 1) {
      if (conversation[index].question === question.text) {
        pair = conversation[index];
        break;
      }
    }

    if (!pair) continue;

    const answer = pair.answer.trim();
    if (!answer) continue;

    result[question.id] = parseStoredAnswer(answer, question.options);
  }

  return result;
}
