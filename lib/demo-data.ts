import { addDaysISO } from "./date";
import {
  DEFAULT_SETTINGS,
  emptySections,
  type AppSettings,
  type FollowUpQuestion,
  type Memory,
  type MemoryPromptItem,
  type ReviewDraft,
  type ReviewListItem,
  type Student,
} from "./types";

/**
 * 演示页面用的固定数据。
 * 全部是虚构姓名，不读数据库、不调用模型，也不包含任何真实学生信息。
 */

export const DEMO_RAW_INPUT = `今天林小满的数学作业写完了，错题讲了两道。她妈妈微信问这周的排课，我说周四晚上有空位。
陈一鸣今天没来上课，打电话问了下，感冒请假，改到周六补。
小橙AI录入了 3 道错题。业绩这边续费了 1 单。`;

export const DEMO_STUDENTS: Student[] = [
  {
    id: "demo-student-1",
    name: "林小满",
    grade: "高一",
    subjects: "数学",
    status: "在读",
    note: null,
  },
  {
    id: "demo-student-2",
    name: "陈一鸣",
    grade: "初三",
    subjects: "数学；物理",
    status: "在读",
    note: null,
  },
];

export const DEMO_MEMORIES: MemoryPromptItem[] = [
  {
    id: "demo-memory-1",
    scope: "student",
    studentName: "林小满",
    category: "家长沟通",
    content: "林小满妈妈偏好微信沟通，比较关注排课时间。",
    importance: 2,
  },
  {
    id: "demo-memory-2",
    scope: "student",
    studentName: "陈一鸣",
    category: "学习习惯",
    content: "陈一鸣数学基础较弱，容易因为身体原因缺课。",
    importance: 2,
  },
];

export const DEMO_QUESTIONS: FollowUpQuestion[] = [
  {
    id: "demo-q1",
    text: "林小满妈妈的排课最后确认了吗？",
    options: ["已确认周四", "还在等她回复", "没有"],
    multiple: false,
    target: "jiaoxiao",
    reason: "家校沟通需要写清结果",
  },
  {
    id: "demo-q2",
    text: "陈一鸣周六补课的时间跟家长确认了吗？",
    options: ["已确认", "还没确认", "没有"],
    multiple: false,
    target: "xueqing",
    reason: "补课安排需要写清是否落实",
  },
  {
    id: "demo-q3",
    text: "今天有试听、转介绍或扩科的进展吗？",
    options: ["没有", "有，稍后补充"],
    multiple: false,
    target: "yeji",
    reason: "业绩栏目需要确认是否为空",
  },
];

const CONCISE_SECTIONS = {
  xueqing: [
    "林小满：完成今日数学作业，错题已讲解。",
    "陈一鸣：感冒请假未到课，课程调整到周六补。",
  ],
  jiaoxiao: [
    "林小满妈妈（微信）：沟通本周排课，周四晚有空位，已确认。",
    "陈一鸣家长（电话）：说明请假情况，确认周六补课。",
  ],
  yeji: ["完成续费 1 单。"],
  richang: [
    "今天主要跟进了两位学生的作业和排课调整，整体推进正常，后续继续盯到课和课消。",
  ],
  xiaocheng: ["小橙AI 录入 3 道错题。"],
  jiaoyan: ["参加学管部教研，讨论本周续费话术。"],
};

const DETAILED_SECTIONS = {
  xueqing: [
    "对接学员林小满，跟进今日数学作业完成情况，完成两道错题的讲解与整理，后续持续关注其订正质量。",
    "对接学员陈一鸣，今日因感冒请假未到课，已与家长电话确认情况，课程调整至周六补课。",
  ],
  jiaoxiao: [
    "与林小满妈妈微信沟通，同步本周排课安排，确认周四晚有空位并完成确认，后续按新课表执行。",
    "与陈一鸣家长电话沟通，说明今日缺课情况，确认周六补课安排，后续关注补课后的吸收情况。",
  ],
  yeji: ["完成续费 1 单，跟进续费后的课消进度，后续持续关注剩余课时。"],
  richang: [
    "今天主要跟进了两位学生的作业完成和排课调整，整体推进正常，后续继续盯学生到课率和课消进度。",
  ],
  xiaocheng: ["小橙AI 完成 3 道错题录入，后续继续跟进错题订正情况。"],
  jiaoyan: ["参加学管部教研，讨论本周续费话术，整理后可复用到日常跟进中。"],
};

function draftFrom(
  sections: Partial<typeof CONCISE_SECTIONS>,
): ReviewDraft {
  return {
    sections: { ...emptySections(), ...sections },
    questions: [],
    notes: [],
  };
}

export const DEMO_DRAFT_CONCISE = draftFrom(CONCISE_SECTIONS);
export const DEMO_DRAFT_DETAILED = draftFrom(DETAILED_SECTIONS);

export const DEMO_SETTINGS: AppSettings = { ...DEFAULT_SETTINGS };

/** 模拟一次生成耗时，让演示更接近真实节奏 */
export const DEMO_THINKING_MS = 1200;

export const DEMO_AI_MODEL = "deepseek-flash";

/** 记忆管理页需要完整的 Memory 字段，日期按当天动态生成 */
export function buildDemoMemoryList(today: string): Memory[] {
  const stamp = `${today}T10:00:00.000Z`;

  return [
    {
      id: "demo-memory-1",
      scope: "student",
      studentId: "demo-student-1",
      studentName: "林小满",
      category: "家长沟通",
      content: "林小满妈妈偏好微信沟通，比较关注排课时间。",
      importance: 2,
      status: "active",
      sourceDate: addDaysISO(today, -3),
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      id: "demo-memory-2",
      scope: "student",
      studentId: "demo-student-2",
      studentName: "陈一鸣",
      category: "学习习惯",
      content: "陈一鸣数学基础较弱，容易因为身体原因缺课。",
      importance: 2,
      status: "active",
      sourceDate: addDaysISO(today, -5),
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      id: "demo-memory-3",
      scope: "general",
      studentId: null,
      studentName: null,
      category: "工作流程",
      content: "每天 18:30 前把当天复盘发到钉钉学管群。",
      importance: 3,
      status: "active",
      sourceDate: addDaysISO(today, -8),
      createdAt: stamp,
      updatedAt: stamp,
    },
  ];
}

/** 历史页的演示列表：两条已完成，一条待补全 */
export function buildDemoReviews(today: string): ReviewListItem[] {
  return [
    {
      id: "demo-review-1",
      reviewDate: addDaysISO(today, -1),
      style: "concise",
      finalText: [
        "学管部工作复盘⬇️",
        "",
        `${addDaysISO(today, -1)}工作复盘`,
        "",
        "🍊【学情跟进】",
        "1️⃣林小满：完成校内数学作业，错题已讲解。",
        "",
        "🍊【家校沟通】",
        "1️⃣林小满妈妈（微信）：同步本周作业安排。",
        "",
        "🍊【日常工作复盘】",
        "1️⃣今天主要盯了作业和错题，后续继续关注订正质量。",
      ].join("\n"),
      questions: 0,
      updatedAt: `${addDaysISO(today, -1)}T09:30:00.000Z`,
    },
    {
      id: "demo-review-2",
      reviewDate: addDaysISO(today, -2),
      style: "detailed",
      finalText: [
        "学管部工作复盘⬇️",
        "",
        `${addDaysISO(today, -2)}工作复盘`,
        "",
        "🍊【学情跟进】",
        "1️⃣对接学员陈一鸣，跟进本周数学作业完成情况，完成错题讲解与整理。",
        "",
        "🍊【业绩跟踪】",
        "1️⃣完成续费 1 单，后续关注剩余课时。",
      ].join("\n"),
      questions: 0,
      updatedAt: `${addDaysISO(today, -2)}T09:15:00.000Z`,
    },
    {
      id: "demo-review-3",
      reviewDate: addDaysISO(today, -3),
      style: "concise",
      finalText: "",
      questions: 2,
      updatedAt: `${addDaysISO(today, -3)}T18:40:00.000Z`,
    },
  ];
}
