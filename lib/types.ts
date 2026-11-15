export type SectionKey =
  | "xueqing"
  | "jiaoxiao"
  | "yeji"
  | "richang"
  | "xiaocheng"
  | "kunnan"
  | "jiaoyan";

export type ReviewStyle = "concise" | "detailed";

/** 追问最多进行几轮（每轮最多 3 个问题） */
export const MAX_FOLLOW_UP_ROUNDS = 3;
export const MAX_QUESTIONS_PER_ROUND = 3;

export type StudentStatus = "在读" | "停课" | "潜在" | "已结课";

export type FollowUpQuestion = {
  id: string;
  text: string;
  options: string[];
  multiple: boolean;
  target: SectionKey | "general";
  reason?: string;
};

export type ReviewDraft = {
  sections: Record<SectionKey, string[]>;
  /** 旧版固定话术，仅用于兼容历史复盘；新生成不再写入 */
  dailyPhrase?: string;
  questions: FollowUpQuestion[];
  notes: string[];
};

export type QAPair = {
  question: string;
  answer: string;
};

export type Student = {
  id: string;
  name: string;
  grade: string | null;
  subjects: string | null;
  status: StudentStatus;
  note: string | null;
};

export type MemoryScope = "student" | "general";

export const MEMORY_CATEGORIES = [
  "学习习惯",
  "成绩薄弱点",
  "家长沟通",
  "报名续费",
  "课时排课",
  "性格情绪",
  "工作流程",
  "长期目标",
  "其他",
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export type Memory = {
  id: string;
  scope: MemoryScope;
  studentId: string | null;
  studentName: string | null;
  category: MemoryCategory;
  content: string;
  importance: number;
  status: "active" | "archived";
  sourceDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MemoryInput = {
  scope: MemoryScope;
  studentId: string | null;
  studentName: string | null;
  category: MemoryCategory;
  content: string;
  importance: number;
  sourceDate?: string | null;
};

export type MemoryPromptItem = {
  id: string;
  scope: MemoryScope;
  studentName: string | null;
  category: MemoryCategory;
  content: string;
  importance: number;
};

export type AppSettings = {
  defaultStyle: ReviewStyle;
  showJiaoyan: boolean;
  showKunnan: boolean;
  showFixedPhrase: boolean;
  enableMemory: boolean;
};

export type ReviewRecord = {
  id: string;
  reviewDate: string;
  rawInput: string;
  draft: ReviewDraft;
  finalText: string;
  style: ReviewStyle;
  conversation: QAPair[];
  round: number;
  memoryExtractedAt: string | null;
  updatedAt: string;
};

export type ReviewListItem = {
  id: string;
  reviewDate: string;
  style: ReviewStyle;
  finalText: string;
  questions: number;
  updatedAt: string;
};

export type SectionMeta = {
  title: string;
  short: string;
  description: string;
  placeholder: string;
};

export const CORE_SECTIONS: SectionKey[] = [
  "xueqing",
  "jiaoxiao",
  "yeji",
  "richang",
  "xiaocheng",
];

export const OPTIONAL_SECTIONS: SectionKey[] = ["kunnan", "jiaoyan"];

export const SECTION_ORDER: SectionKey[] = [
  "xueqing",
  "jiaoxiao",
  "yeji",
  "richang",
  "kunnan",
  "xiaocheng",
  "jiaoyan",
];

export const SECTION_META: Record<SectionKey, SectionMeta> = {
  xueqing: {
    title: "学情跟进",
    short: "学情",
    description:
      "学生作业、错题、上课、自习、排课、课时核对、值班、课表、通知等",
    placeholder: "林小满今天作业完成了，错题讲了两道，跟老师对接了一下……",
  },
  jiaoxiao: {
    title: "家校沟通",
    short: "家校",
    description: "和家长沟通的对象、渠道（微信/电话/面聊）、内容与结果",
    placeholder: "林小满妈妈微信沟通，说这周作业完成得不错……",
  },
  yeji: {
    title: "业绩跟踪",
    short: "业绩",
    description: "试听、续费、签单、转介绍、扩科、课耗、到访等进展",
    placeholder: "今天约了一个试听，家长说周六过来……",
  },
  richang: {
    title: "日常工作复盘",
    short: "日常",
    description: "反思、改进、会议、计划、服务理念",
    placeholder: "今天服务还可以再细一点，明天提前把资料准备好……",
  },
  xiaocheng: {
    title: "小橙Ai推进",
    short: "小橙",
    description: "错题录入、学生/教师信息录入、错题收集等",
    placeholder: "林小满的数学错题已录入小橙AI系统……",
  },
  kunnan: {
    title: "工作困难",
    short: "困难",
    description: "今天遇到的困难、卡点，以及打算怎么解决",
    placeholder: "目前没有困难，有困难都已经想办法解决。",
  },
  jiaoyan: {
    title: "教研相关",
    short: "教研",
    description: "教讨会、教研、教学研讨等内容",
    placeholder: "今天开了新生教讨会，定了上课节奏和跟进方式……",
  },
};

export const NO_DIFFICULTY_PHRASE =
  "目前没有困难，有困难都已经想办法解决。";

export const DEFAULT_SETTINGS: AppSettings = {
  defaultStyle: "concise",
  showJiaoyan: true,
  showKunnan: false,
  showFixedPhrase: true,
  enableMemory: true,
};

export function emptySections(): Record<SectionKey, string[]> {
  return {
    xueqing: [],
    jiaoxiao: [],
    yeji: [],
    richang: [],
    xiaocheng: [],
    kunnan: [],
    jiaoyan: [],
  };
}

export function emptyDraft(): ReviewDraft {
  return {
    sections: emptySections(),
    questions: [],
    notes: [],
  };
}

export function hasDraftContent(draft: ReviewDraft): boolean {
  // 只有栏目里有内容才算可发送；notes 只是提示，不算正文
  return Object.values(draft.sections).some((items) => items.length > 0);
}
