import type { ReviewDraft } from "./types";

/** 设置页预览和今日复盘空状态共用的一份示例草稿 */
export const SAMPLE_DRAFT: ReviewDraft = {
  sections: {
    xueqing: ["林小满：完成今日校内作业，错题已讲解。"],
    jiaoxiao: ["林小满妈妈（微信）：沟通今日作业完成情况。"],
    yeji: [],
    richang: [
      "下次给林小满讲错题时，可以先把订正检查的时间约好，第二天上课前看一眼完成情况，家长问起来也能直接回答。",
    ],
    xiaocheng: ["林小满的数学错题已录入小橙AI系统。"],
    kunnan: [],
    jiaoyan: ["参加学管部教研，讨论新生跟进节奏。"],
  },
  questions: [],
  notes: [],
};
