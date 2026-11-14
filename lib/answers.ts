// 追问答案的纯状态逻辑，方便单测，也避免组件里状态互相覆盖。

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
