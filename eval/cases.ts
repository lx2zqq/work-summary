import type { PromptContext } from "@/lib/ai/prompt";
import type { EvalExpect } from "@/lib/eval/checks";
import {
  DEFAULT_SETTINGS,
  MAX_FOLLOW_UP_ROUNDS,
  emptySections,
  type AppSettings,
  type MemoryCategory,
  type MemoryPromptItem,
  type QAPair,
  type ReviewDraft,
  type ReviewStyle,
  type SectionKey,
  type Student,
} from "@/lib/types";

export type EvalCase = {
  id: string;
  tags: string[];
  mode: "questions" | "final" | "restyle";
  rawInput: string;
  style: ReviewStyle;
  studentNames?: string[];
  answers?: QAPair[];
  memories?: Array<{
    studentName?: string;
    content: string;
    category: MemoryCategory;
    importance?: number;
  }>;
  currentDraft?: ReviewDraft;
  settings?: Partial<AppSettings>;
  /** 检查拼好的 prompt 是否真的带上了这些内容 */
  promptIncludes?: string[];
  expect: EvalExpect;
};

const STUDENT_IDS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
];

function draftOf(
  sections: Partial<Record<SectionKey, string[]>>,
): ReviewDraft {
  return {
    sections: { ...emptySections(), ...sections },
    questions: [],
    notes: [],
  };
}

export function buildEvalContext(item: EvalCase): PromptContext {
  const students: Student[] = (item.studentNames ?? []).map(
    (name, index) => ({
      id: STUDENT_IDS[index % STUDENT_IDS.length],
      name,
      grade: null,
      subjects: null,
      status: "在读",
      note: null,
    }),
  );

  const memories: MemoryPromptItem[] = (item.memories ?? []).map(
    (memory, index) => ({
      id: `memory-${index + 1}`,
      scope: memory.studentName ? "student" : "general",
      studentName: memory.studentName ?? null,
      category: memory.category,
      content: memory.content,
      importance: memory.importance ?? 2,
    }),
  );

  return {
    mode: item.mode,
    reviewDate: "2026-11-15",
    style: item.style,
    settings: { ...DEFAULT_SETTINGS, ...item.settings },
    students,
    recentReviews: [],
    memories,
    rawInput: item.rawInput,
    answers: item.answers ?? [],
    currentDraft: item.currentDraft,
    round:
      item.mode === "questions" ? 0 : MAX_FOLLOW_UP_ROUNDS,
  };
}

/** 数据集自检：期望值必须能在输入里找到，避免拿错误标准评判模型 */
export function validateCase(item: EvalCase): string[] {
  const issues: string[] = [];

  if (!item.rawInput.trim()) issues.push("rawInput 为空");
  if (item.mode === "restyle" && !item.currentDraft) {
    issues.push("restyle 缺少 currentDraft");
  }
  if (
    item.mode === "questions" &&
    (item.expect.maxQuestions ?? 0) > 3
  ) {
    issues.push("追问上限不能超过 3");
  }

  const source = [
    item.rawInput,
    ...(item.answers ?? []).map(
      (pair) => `${pair.question} ${pair.answer}`,
    ),
    item.currentDraft
      ? JSON.stringify(item.currentDraft.sections)
      : "",
  ].join("\n");

  for (const value of item.expect.mustInclude ?? []) {
    if (!source.includes(value)) {
      issues.push(`mustInclude“${value}”不在输入里`);
    }
  }

  for (const value of item.expect.forbidStudents ?? []) {
    if (source.includes(value)) {
      issues.push(`forbidStudents“${value}”出现在输入里`);
    }
  }

  return issues;
}

const LONG_INPUT = Array.from(
  { length: 18 },
  () => "整理学生档案，核对课时，更新课表，前台值班。",
).join("");

export const EVAL_CASES: EvalCase[] = [
  // ---------- 短流水账 ----------
  {
    id: "short-001",
    tags: ["short", "final", "core-sections"],
    mode: "final",
    rawInput:
      "今天林小满作业完成了，数学错题讲了两道，跟她妈妈微信说了下。",
    style: "concise",
    studentNames: ["林小满"],
    expect: {
      mustInclude: ["林小满"],
      forbidStudents: ["周子航"],
      sections: {
        xueqing: { minItems: 1 },
        jiaoxiao: { minItems: 1 },
      },
    },
  },
  {
    id: "short-002",
    tags: ["short", "final", "performance"],
    mode: "final",
    rawInput:
      "今天约了一个新家长周六来试听，另外前台值班核对了课时。",
    style: "concise",
    expect: {
      mustNotInclude: ["林小满", "周子航"],
      sections: {
        yeji: { minItems: 1 },
        xueqing: { minItems: 1 },
      },
    },
  },
  {
    id: "short-003",
    tags: ["short", "final", "detailed"],
    mode: "final",
    rawInput: "上午巡课，下午更新课表，晚上在家长群发通知。",
    style: "detailed",
    expect: {
      mustNotInclude: ["林小满", "周子航"],
      sections: { xueqing: { minItems: 1 } },
    },
  },
  {
    id: "short-004",
    tags: ["short", "final", "anti-hallucination"],
    mode: "final",
    rawInput: "今天没有特别的事，正常上班。",
    style: "concise",
    expect: {
      allowEmpty: true,
      mustNotInclude: ["林小满", "周子航"],
      sections: {
        yeji: { maxItems: 0 },
        jiaoxiao: { maxItems: 0 },
      },
    },
  },
  {
    id: "short-005",
    tags: ["short", "final", "core-sections"],
    mode: "final",
    rawInput:
      "给周子航录了数学错题，跟家长电话沟通了续费。",
    style: "concise",
    studentNames: ["周子航"],
    expect: {
      mustInclude: ["周子航"],
      forbidStudents: ["林小满"],
      sections: {
        xiaocheng: { minItems: 1 },
        jiaoxiao: { minItems: 1 },
        yeji: { minItems: 1 },
      },
    },
  },

  // ---------- 中等流水账 ----------
  {
    id: "medium-001",
    tags: ["medium", "final", "core-sections"],
    mode: "final",
    rawInput:
      "今天林小满的校内作业完成了，数学错题讲了三道；她妈妈微信说这周想加一节英语课；下午跟一个新家长电话约了周六试听。",
    style: "detailed",
    studentNames: ["林小满"],
    expect: {
      mustInclude: ["林小满"],
      forbidStudents: ["周子航"],
      sections: {
        xueqing: { minItems: 1 },
        jiaoxiao: { minItems: 1 },
        yeji: { minItems: 1 },
      },
    },
  },
  {
    id: "medium-002",
    tags: ["medium", "final", "optional-sections"],
    mode: "final",
    rawInput:
      "下午开了学管部教研会，讨论期中复习安排；晚上整理了明天要发的资料。",
    style: "concise",
    expect: {
      mustNotInclude: ["林小满", "周子航"],
      sections: {
        jiaoyan: { minItems: 1 },
        xueqing: { minItems: 1 },
      },
    },
  },
  {
    id: "medium-003",
    tags: ["medium", "final", "multi-student"],
    mode: "final",
    rawInput:
      "林小满作业完成，错题讲了两道；周子航上课注意力不太集中，跟老师对接了。",
    style: "concise",
    studentNames: ["林小满", "周子航"],
    expect: {
      mustInclude: ["林小满", "周子航"],
      forbidStudents: ["陈一鸣"],
      sections: { xueqing: { minItems: 2 } },
    },
  },
  {
    id: "medium-004",
    tags: ["medium", "final", "parent"],
    mode: "final",
    rawInput:
      "陈一鸣妈妈面聊，说孩子最近作业慢，我跟数学老师对接了，约好下周调整练习量。",
    style: "detailed",
    studentNames: ["陈一鸣"],
    expect: {
      mustInclude: ["陈一鸣"],
      forbidStudents: ["林小满"],
      sections: {
        jiaoxiao: { minItems: 1 },
        xueqing: { minItems: 1 },
      },
    },
  },
  {
    id: "medium-005",
    tags: ["medium", "final", "performance"],
    mode: "final",
    rawInput:
      "今天陈一鸣续费了 3000 元，课时已经核对，家长微信确认了。",
    style: "concise",
    studentNames: ["陈一鸣"],
    expect: {
      mustInclude: ["陈一鸣", "3000"],
      forbidStudents: ["周子航"],
      sections: {
        yeji: { minItems: 1 },
        jiaoxiao: { minItems: 1 },
      },
    },
  },

  // ---------- 长流水账 ----------
  {
    id: "long-001",
    tags: ["long", "final", "core-sections"],
    mode: "final",
    rawInput:
      "今天上午前台值班，核对课时，更新课表。林小满妈妈面聊，说孩子最近作业慢，我跟老师对接了。下午给林小满录了数学错题，还录了一个新学生周子航的信息。晚上跟家长群发通知。",
    style: "concise",
    studentNames: ["林小满", "周子航"],
    expect: {
      mustInclude: ["林小满", "周子航"],
      forbidStudents: ["陈一鸣"],
      sections: {
        xueqing: { minItems: 2 },
        jiaoxiao: { minItems: 1 },
        xiaocheng: { minItems: 1 },
      },
    },
  },
  {
    id: "long-002",
    tags: ["long", "final", "detailed"],
    mode: "final",
    rawInput:
      "上午接待了两位新家长，介绍了课程和试听安排；下午给林小满讲错题，跟周子航妈妈电话沟通续费；晚上整理学生档案，把陈一鸣的错题录入小橙AI。",
    style: "detailed",
    studentNames: ["林小满", "周子航", "陈一鸣"],
    expect: {
      mustInclude: ["林小满", "周子航", "陈一鸣"],
      sections: {
        xueqing: { minItems: 1 },
        jiaoxiao: { minItems: 1 },
        yeji: { minItems: 1 },
        xiaocheng: { minItems: 1 },
      },
    },
  },
  {
    id: "long-003",
    tags: ["long", "final", "performance"],
    mode: "final",
    rawInput:
      "今天林小满试听转报名，周子航续费一学期，陈一鸣转介绍了一个新学生李雨桐；下午开了教研会，讨论期中复习。",
    style: "concise",
    studentNames: ["林小满", "周子航", "陈一鸣", "李雨桐"],
    expect: {
      mustInclude: ["林小满", "周子航", "陈一鸣", "李雨桐"],
      sections: {
        yeji: { minItems: 3 },
        jiaoyan: { minItems: 1 },
      },
    },
  },
  {
    id: "long-004",
    tags: ["long", "final", "difficulty"],
    mode: "final",
    rawInput:
      "今天遇到一个困难：家长对排课时间不满意，已经沟通调整到周六上午，家长接受。其他工作正常。",
    style: "detailed",
    settings: { showKunnan: true },
    expect: {
      mustInclude: ["周六"],
      sections: {
        kunnan: { minItems: 1 },
        jiaoxiao: { minItems: 1 },
      },
    },
  },
  {
    id: "long-005",
    tags: ["long", "final", "voice-style"],
    mode: "final",
    rawInput:
      "今天语音记录：早上巡课，林小满上课状态不错；中午跟周子航家长微信沟通续费；下午整理陈一鸣的错题，录入小橙AI；晚上更新明天课表。",
    style: "detailed",
    studentNames: ["林小满", "周子航", "陈一鸣"],
    expect: {
      mustInclude: ["林小满", "周子航", "陈一鸣"],
      sections: {
        xueqing: { minItems: 1 },
        jiaoxiao: { minItems: 1 },
        xiaocheng: { minItems: 1 },
      },
    },
  },

  // ---------- 边界与异常 ----------
  {
    id: "edge-001",
    tags: ["edge", "final", "empty"],
    mode: "final",
    rawInput: "今天。",
    style: "concise",
    expect: {
      allowEmpty: true,
      mustNotInclude: ["林小满", "周子航"],
      sections: {
        yeji: { maxItems: 0 },
        jiaoxiao: { maxItems: 0 },
      },
    },
  },
  {
    id: "edge-002",
    tags: ["edge", "final", "long-input"],
    mode: "final",
    rawInput: LONG_INPUT,
    style: "detailed",
    expect: {
      mustNotInclude: ["林小满", "周子航"],
      sections: { xueqing: { minItems: 1 } },
    },
  },
  {
    id: "edge-003",
    tags: ["edge", "final", "numbers"],
    mode: "final",
    rawInput:
      "今天给林小满录了 3 道数学错题，家长微信说周五 18:30 来接。",
    style: "concise",
    studentNames: ["林小满"],
    expect: {
      mustInclude: ["林小满", "3"],
      forbidStudents: ["周子航"],
      sections: {
        xiaocheng: { minItems: 1 },
        jiaoxiao: { minItems: 1 },
      },
    },
  },
  {
    id: "edge-004",
    tags: ["edge", "final", "negative"],
    mode: "final",
    rawInput:
      "今天没有业绩进展，也没有家长沟通，主要做了日常排课和课表更新。",
    style: "concise",
    expect: {
      mustNotInclude: ["林小满", "周子航"],
      sections: {
        yeji: { maxItems: 0 },
        jiaoxiao: { maxItems: 0 },
        xueqing: { minItems: 1 },
      },
    },
  },
  {
    id: "edge-005",
    tags: ["edge", "final", "negative"],
    mode: "final",
    rawInput:
      "今天没有困难，工作都正常，下午整理了学生档案。",
    style: "concise",
    settings: { showKunnan: true },
    expect: {
      mustNotInclude: ["林小满", "周子航"],
      sections: { kunnan: { maxItems: 0 } },
    },
  },

  // ---------- 长期记忆 ----------
  {
    id: "memory-001",
    tags: ["memory", "questions"],
    mode: "questions",
    rawInput: "今天林小满来上课了，作业完成得还可以。",
    style: "concise",
    studentNames: ["林小满"],
    memories: [
      {
        studentName: "林小满",
        content: "林小满的数学试听课已报名，家长已交费。",
        category: "报名续费",
        importance: 3,
      },
    ],
    promptIncludes: ["林小满的数学试听课已报名"],
    expect: {
      minQuestions: 1,
      maxQuestions: 3,
      questionMustHaveOptions: true,
    },
  },
  {
    id: "memory-002",
    tags: ["memory", "final", "irrelevant"],
    mode: "final",
    rawInput: "今天前台值班，核对课时，更新课表。",
    style: "concise",
    memories: [
      {
        studentName: "周子航",
        content: "周子航的数学课已续费一学期。",
        category: "报名续费",
        importance: 3,
      },
    ],
    expect: {
      mustNotInclude: ["周子航"],
      forbidStudents: ["周子航"],
      sections: { yeji: { maxItems: 0 } },
    },
  },
  {
    id: "memory-003",
    tags: ["memory", "final", "conflict"],
    mode: "final",
    rawInput: "今天林小满的数学课报名了，家长已经交费。",
    style: "concise",
    studentNames: ["林小满"],
    memories: [
      {
        studentName: "林小满",
        content: "林小满的数学课还未报名。",
        category: "报名续费",
        importance: 3,
      },
    ],
    promptIncludes: ["林小满的数学课还未报名"],
    expect: {
      mustInclude: ["林小满", "报名"],
      mustNotInclude: ["还未报名"],
      sections: { yeji: { minItems: 1 } },
    },
  },
  {
    id: "memory-004",
    tags: ["memory", "questions"],
    mode: "questions",
    rawInput: "今天周子航来上课，状态一般。",
    style: "concise",
    studentNames: ["周子航"],
    memories: [
      {
        studentName: "周子航",
        content: "周子航家长希望每周收到一次学习反馈。",
        category: "家长沟通",
        importance: 2,
      },
    ],
    promptIncludes: ["周子航家长希望每周收到一次学习反馈"],
    expect: {
      minQuestions: 1,
      maxQuestions: 3,
      questionMustHaveOptions: true,
    },
  },
  {
    id: "memory-005",
    tags: ["memory", "final", "filter"],
    mode: "final",
    rawInput: "今天林小满作业完成，错题讲了两道。",
    style: "concise",
    studentNames: ["林小满", "周子航"],
    memories: [
      {
        studentName: "林小满",
        content: "林小满的英语基础较弱。",
        category: "成绩薄弱点",
        importance: 2,
      },
      {
        studentName: "周子航",
        content: "周子航的数学课已续费。",
        category: "报名续费",
        importance: 3,
      },
    ],
    expect: {
      mustInclude: ["林小满"],
      mustNotInclude: ["周子航"],
      forbidStudents: ["周子航"],
    },
  },

  // ---------- 改文风 ----------
  {
    id: "style-001",
    tags: ["style", "restyle", "detailed"],
    mode: "restyle",
    rawInput: "今天林小满作业完成，错题讲了两道。",
    style: "detailed",
    studentNames: ["林小满"],
    currentDraft: draftOf({
      xueqing: ["林小满：完成今日作业，错题已讲解。"],
    }),
    expect: {
      mustInclude: ["林小满"],
      forbidStudents: ["周子航"],
      sameItemCount: true,
      detailedMustBeLonger: true,
    },
  },
  {
    id: "style-002",
    tags: ["style", "restyle", "concise"],
    mode: "restyle",
    rawInput: "今天林小满作业完成，错题讲了两道。",
    style: "concise",
    studentNames: ["林小满"],
    currentDraft: draftOf({
      xueqing: [
        "对接学员林小满，跟进今日作业完成情况，完成错题讲解与整理，后续持续关注其课堂吸收情况。",
      ],
      jiaoxiao: [
        "与林小满妈妈微信沟通，同步今日作业完成情况。",
      ],
    }),
    expect: {
      mustInclude: ["林小满"],
      forbidStudents: ["周子航"],
      sameItemCount: true,
    },
  },
  {
    id: "style-003",
    tags: ["style", "restyle", "empty-sections"],
    mode: "restyle",
    rawInput: "今天整理资料，正常上班。",
    style: "detailed",
    currentDraft: draftOf({
      xueqing: [],
      jiaoxiao: [],
      yeji: [],
      richang: ["今天整理了明天要用的复习资料。"],
    }),
    expect: {
      mustNotInclude: ["林小满", "周子航"],
      sameItemCount: true,
    },
  },
  {
    id: "style-004",
    tags: ["style", "restyle", "richang"],
    mode: "restyle",
    rawInput: "今天整理了复习资料。",
    style: "concise",
    currentDraft: draftOf({
      richang: ["今天整理了明天要用的复习资料。"],
    }),
    expect: {
      mustNotInclude: ["林小满", "周子航"],
      sameItemCount: true,
    },
  },
  {
    id: "style-005",
    tags: ["style", "restyle", "detailed"],
    mode: "restyle",
    rawInput: "今天林小满作业完成，跟家长沟通了作业情况。",
    style: "detailed",
    studentNames: ["林小满"],
    currentDraft: draftOf({
      xueqing: ["林小满：完成作业。"],
      jiaoxiao: ["林小满妈妈（微信）：沟通作业情况。"],
    }),
    expect: {
      mustInclude: ["林小满"],
      forbidStudents: ["周子航"],
      sameItemCount: true,
      detailedMustBeLonger: true,
    },
  },
];
