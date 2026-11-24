import type { ReviewDraft } from "./types";

/** 设置页预览和今日复盘空状态共用的一份示例草稿 */
export const SAMPLE_DRAFT: ReviewDraft = {
  sections: {
    xueqing: ["林小满：完成今日校内作业，错题已讲解。"],
    jiaoxiao: ["林小满妈妈（微信）：沟通今日作业完成情况。"],
    yeji: [],
    richang: [
      "今天主要跟进了林小满的作业和错题，整体完成情况正常，后续继续关注订正质量，及时和家长同步进展。",
    ],
    xiaocheng: ["林小满的数学错题已录入小橙AI系统。"],
    kunnan: [],
    jiaoyan: ["参加学管部教研，讨论新生跟进节奏。"],
  },
  questions: [],
  notes: [],
};
