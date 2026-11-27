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

/** 日常工作复盘的最短有效字数，prompt 与 eval 检查共用 */
export const RICHANG_MIN_CHARS = 25;

/** 用户跳过日常复盘追问时提交的明确标记，prompt 据此走“由 AI 提炼”分支 */
export const AI_SKIP_ANSWER = "跳过，由 AI 提炼";

export type StudentStatus = "在读" | "停课" | "潜在" | "已结课";

export type FollowUpQuestion = {
  id: string;
  text: string;
  options: string[];
  multiple: boolean;
  target: SectionKey | "general";
  /**
   * 可选的栏目标识。目前只用于标记日常复盘追问（"richang"），
   * 前端据此展示“跳过，由 AI 提炼”；旧数据没有该字段时保持 undefined。
   */
  section?: string;
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

/** 长期记忆的生命周期：长期有效或阶段性有效 */
export type MemoryLifecycle = "permanent" | "ephemeral";

/** 记忆状态：活跃、待归档宽限期、已归档 */
export type MemoryStatus = "active" | "pending_archive" | "archived";

/** 记忆生命周期操作，接口和演示内存实现共用 */
export type MemoryLifecycleAction =
  | "keep_permanent"
  | "extend_7d"
  | "archive"
  | "restore";

/** 阶段性记忆过期后进入待归档状态的宽限天数 */
export const MEMORY_ARCHIVE_GRACE_DAYS = 5;
/** 用户选择“顺延”时新增的有效天数 */
export const MEMORY_EXTEND_DAYS = 7;
/** 阶段性记忆默认有效天数 */
export const MEMORY_DEFAULT_TTL_DAYS = 7;
/** 阶段性记忆允许的最长有效天数 */
export const MEMORY_MAX_TTL_DAYS = 90;

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
  status: MemoryStatus;
  lifecycle: MemoryLifecycle;
  expiresAt: string | null;
  archiveAfter: string | null;
  archiveReason: string | null;
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
  lifecycle?: MemoryLifecycle;
  expiresAt?: string | null;
  /** 仅用于计算 expiresAt，不会写入数据库 */
  ttlDays?: number | null;
};

export type MemoryPromptItem = {
  id: string;
  scope: MemoryScope;
  studentName: string | null;
  category: MemoryCategory;
  content: string;
  importance: number;
};

export type PhraseTheme = "general" | "exam" | "meeting" | "mistake";

/** 用户自己添加的通用话术，和内置库一起参与每日轮换 */
export type CustomPhrase = {
  id: string;
  theme: PhraseTheme;
  content: string;
  createdAt: string;
};

/** 自定义话术最多能存多少条，避免稀释内置库风格 */
export const MAX_CUSTOM_PHRASES = 50;

export type AppSettings = {
  defaultStyle: ReviewStyle;
  showJiaoyan: boolean;
  showKunnan: boolean;
  showFixedPhrase: boolean;
  enableMemory: boolean;
  customPhrases: CustomPhrase[];
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

/** 学生页抽屉只需要日期和正文 */
export type ReviewSnippet = {
  id: string;
  reviewDate: string;
  finalText: string;
};

/** 周报状态：草稿可反复编辑，定稿后作为当周最终版本 */
export type WeeklyReportStatus = "draft" | "finalized";

/** 周报结构，字段与 Excel 模板的单元格一一对应 */
export type WeeklyReportContent = {
  summary: {
    miantan: string;
    weixin: string;
  };
  metrics: {
    qingjia: string;
    yujing: string;
    tingke: string;
    jieke: string;
    kuoke: string;
    xinqian: string;
    xufei: string;
    activeStudentsByGrade: string;
  };
  reflection: string;
  nextWeek: {
    zhongdianHuifang: string;
    jiazhanghui: string;
  };
  supportNeeded: string;
};

/** 周次信息，纯文本标题、Excel 文档属性共用 */
export type WeeklyReportMeta = {
  weekStart: string;
  weekEnd: string;
};

export type WeeklyReport = {
  id: string;
  weekStart: string;
  weekEnd: string;
  content: WeeklyReportContent;
  status: WeeklyReportStatus;
  sourceReviewCount: number;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** 周报生成用的一条来源日报 */
export type WeeklySourceReview = {
  reviewDate: string;
  finalText: string;
  draft: ReviewDraft;
  rawInput: string;
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
  customPhrases: [],
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
