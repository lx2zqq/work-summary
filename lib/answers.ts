// 追问答案的纯状态逻辑，方便单测，也避免组件里状态互相覆盖。

import type { FollowUpQuestion, QAPair } from "./types";

export type QuestionAnswer = {
  selected: string[];
  custom: string;
};

export const EMPTY_ANSWER: QuestionAnswer = {
  selected: [],
  custom: "",
};

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

export function buildAnswer(state: QuestionAnswer): string {
  const custom = state.custom.trim();

  if (state.selected.length === 0) {
    return custom;
  }

  const selected = state.selected.join("、");
  return custom ? `${selected}；补充：${custom}` : selected;
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
  const marker = "；补充：";

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

    const markerIndex = answer.indexOf(marker);
    const selectedPart =
      markerIndex >= 0 ? answer.slice(0, markerIndex) : answer;
    const customPart =
      markerIndex >= 0 ? answer.slice(markerIndex + marker.length) : "";
    const selected = selectedPart
      .split("、")
      .map((value) => value.trim())
      .filter((value) => question.options.includes(value));
    const custom =
      customPart || (selected.length === 0 ? selectedPart : "");

    result[question.id] = { selected, custom };
  }

  return result;
}
