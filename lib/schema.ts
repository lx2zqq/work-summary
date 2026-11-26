import { z } from "zod";
import { isValidISODate } from "./date";
import { MAX_FOLLOW_UP_ROUNDS, MEMORY_CATEGORIES } from "./types";

// 手动重新生成会重置追问轮次但保留历史问答，所以不能按单次 3×3 来限制
const MAX_QA_HISTORY = 200;
const QA_HISTORY_TOO_LONG = "问答记录太长了，请刷新页面后重试";

export const sectionKeySchema = z.enum([
  "xueqing",
  "jiaoxiao",
  "yeji",
  "richang",
  "xiaocheng",
  "kunnan",
  "jiaoyan",
]);

export const reviewStyleSchema = z.enum(["concise", "detailed"]);

/** 严格日历日期：格式正确且年月日真实存在 */
export const isoDateSchema = z
  .string()
  .refine(isValidISODate, "日期格式不对");

export const studentStatusSchema = z.enum([
  "在读",
  "停课",
  "潜在",
  "已结课",
]);

const sectionItemsSchema = z.array(z.string().max(600)).max(30).optional();

const questionSchema = z.object({
  id: z.string().max(40).optional(),
  text: z.string().min(1).max(200),
  options: z.array(z.string().max(30)).max(6).optional(),
  multiple: z.boolean().optional(),
  target: z
    .union([sectionKeySchema, z.literal("general")])
    .optional(),
  reason: z.string().max(200).optional(),
});

export const draftSchema = z.object({
  sections: z
    .object({
      xueqing: sectionItemsSchema,
      jiaoxiao: sectionItemsSchema,
      yeji: sectionItemsSchema,
      richang: sectionItemsSchema,
      xiaocheng: sectionItemsSchema,
      kunnan: sectionItemsSchema,
      jiaoyan: sectionItemsSchema,
    })
    .optional(),
  dailyPhrase: z.string().trim().max(300).optional(),
  questions: z.array(questionSchema).max(8).optional(),
  notes: z.array(z.string().max(300)).max(8).optional(),
});

export const generateRequestSchema = z.object({
  date: isoDateSchema,
  rawInput: z
    .string()
    .trim()
    .min(1, "请先写一点今天做了什么")
    .max(6000, "内容太长了，先控制在 6000 字以内"),
  style: reviewStyleSchema.default("concise"),
  answers: z
    .array(
      z.object({
        question: z.string().trim().min(1).max(300),
        answer: z.string().trim().min(1).max(600),
      }),
    )
    .max(MAX_QA_HISTORY, QA_HISTORY_TOO_LONG)
    .default([]),
  mode: z.enum(["questions", "final", "restyle"]).default("final"),
  round: z.number().int().min(0).max(MAX_FOLLOW_UP_ROUNDS).default(0),
  currentDraft: draftSchema.optional(),
}).refine(
  (value) => value.mode !== "restyle" || Boolean(value.currentDraft),
  {
    message: "切换文风需要当前草稿",
    path: ["currentDraft"],
  },
);

export const saveReviewSchema = z.object({
  date: isoDateSchema,
  rawInput: z.string().max(6000).default(""),
  draft: draftSchema,
  style: reviewStyleSchema.default("concise"),
  conversation: z
    .array(
      z.object({
        question: z.string().max(300),
        answer: z.string().max(600),
      }),
    )
    .max(MAX_QA_HISTORY, QA_HISTORY_TOO_LONG)
    .default([]),
  round: z.number().int().min(0).max(MAX_FOLLOW_UP_ROUNDS).default(0),
});

export const studentInputSchema = z.object({
  name: z.string().trim().min(1, "请填写学生姓名").max(20, "姓名太长了"),
  grade: z
    .string()
    .trim()
    .max(20)
    .nullish()
    .transform((value) => (value ? value : null)),
  subjects: z
    .string()
    .trim()
    .max(60)
    .nullish()
    .transform((value) => (value ? value : null)),
  status: studentStatusSchema.default("在读"),
  note: z
    .string()
    .trim()
    .max(300)
    .nullish()
    .transform((value) => (value ? value : null)),
});

export const memoryScopeSchema = z.enum(["student", "general"]);
export const memoryCategorySchema = z.enum(MEMORY_CATEGORIES);

export const memoryInputSchema = z
  .object({
    scope: memoryScopeSchema,
    // 表单没选学生时会提交空串，统一转成 null
    studentId: z.preprocess(
      (value) => (value === "" ? null : value),
      z.string().uuid().nullish(),
    ),
    studentName: z.string().trim().max(20).nullish(),
    category: memoryCategorySchema.default("其他"),
    content: z
      .string()
      .trim()
      .min(1, "请填写记忆内容")
      .max(300, "记忆内容太长了"),
    importance: z.number().int().min(1).max(3).default(2),
  })
  .refine(
    (value) =>
      value.scope !== "student" ||
      Boolean(value.studentId || value.studentName?.trim()),
    { message: "请选择学生", path: ["studentId"] },
  );

export const extractMemoriesRequestSchema = z.object({
  date: isoDateSchema,
  force: z.boolean().default(false),
});

export const memoryExtractionSchema = z.object({
  memories: z
    .array(
      z
        .object({
          id: z.string().uuid().nullish(),
          scope: memoryScopeSchema,
          studentName: z.string().trim().max(20).nullish(),
          category: memoryCategorySchema.default("其他"),
          content: z.string().trim().min(1).max(300),
          importance: z.number().int().min(1).max(3).default(2),
        })
        // 学生记忆必须带姓名，否则无法归属到具体学生
        .refine(
          (value) =>
            value.scope !== "student" || Boolean(value.studentName?.trim()),
          { message: "学生记忆需要学生姓名", path: ["studentName"] },
        ),
    )
    .max(10)
    .default([]),
});

export const phrasePreviewSchema = z.object({
  text: z
    .string()
    .trim()
    .min(2, "至少写几个字")
    .max(300, "太长了，先精简一下"),
});

export const addPhraseSchema = z.object({
  phrase: z.string().trim().min(1).max(200),
  theme: z.enum(["general", "exam", "meeting", "mistake"]),
});

export const settingsPatchSchema = z
  .object({
    defaultStyle: reviewStyleSchema.optional(),
    showJiaoyan: z.boolean().optional(),
    showKunnan: z.boolean().optional(),
    showFixedPhrase: z.boolean().optional(),
    enableMemory: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "没有要更新的设置",
  });

export const loginSchema = z.object({
  password: z.string().min(1).max(100),
});

export type DraftInput = z.infer<typeof draftSchema>;
export type GenerateRequest = z.infer<typeof generateRequestSchema>;
export type SaveReviewRequest = z.infer<typeof saveReviewSchema>;
export type StudentInput = z.infer<typeof studentInputSchema>;
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
export type MemoryInputPayload = z.infer<typeof memoryInputSchema>;
export type ExtractedMemory = z.infer<
  typeof memoryExtractionSchema
>["memories"][number];
