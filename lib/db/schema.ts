import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  CustomPhrase,
  MemoryCategory,
  MemoryLifecycle,
  MemoryScope,
  MemoryStatus,
  QAPair,
  ReviewDraft,
  ReviewStyle,
  StudentStatus,
  WeeklyReportContent,
  WeeklyReportStatus,
} from "@/lib/types";

export const students = pgTable("students", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  grade: text("grade"),
  subjects: text("subjects"),
  status: text("status").$type<StudentStatus>().notNull().default("在读"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const reviews = pgTable("reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  reviewDate: date("review_date", { mode: "string" }).notNull().unique(),
  rawInput: text("raw_input").notNull().default(""),
  draft: jsonb("draft").$type<ReviewDraft>().notNull(),
  finalText: text("final_text").notNull().default(""),
  style: text("style").$type<ReviewStyle>().notNull().default("concise"),
  conversation: jsonb("conversation")
    .$type<QAPair[]>()
    .notNull()
    .default([]),
  round: integer("round").notNull().default(0),
  status: text("status").notNull().default("draft"),
  memoryExtractedAt: timestamp("memory_extracted_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  defaultStyle: text("default_style")
    .$type<ReviewStyle>()
    .notNull()
    .default("concise"),
  showJiaoyan: boolean("show_jiaoyan").notNull().default(true),
  showKunnan: boolean("show_kunnan").notNull().default(false),
  showFixedPhrase: boolean("show_fixed_phrase").notNull().default(true),
  enableMemory: boolean("enable_memory").notNull().default(true),
  /** 用户自己添加的通用话术，和内置库一起参与每日轮换 */
  customPhrases: jsonb("custom_phrases")
    .$type<CustomPhrase[]>()
    .notNull()
    .default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scope: text("scope").$type<MemoryScope>().notNull(),
    studentId: uuid("student_id").references(() => students.id, {
      onDelete: "set null",
    }),
    studentName: text("student_name"),
    category: text("category")
      .$type<MemoryCategory>()
      .notNull()
      .default("其他"),
    content: text("content").notNull(),
    importance: integer("importance").notNull().default(2),
    status: text("status")
      .$type<MemoryStatus>()
      .notNull()
      .default("active"),
    lifecycle: text("lifecycle")
      .$type<MemoryLifecycle>()
      .notNull()
      .default("permanent"),
    /** NULL 表示永不过期；阶段性记忆到期后进入待归档 */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** 进入 pending_archive 后的宽限期截止时间 */
    archiveAfter: timestamp("archive_after", { withTimezone: true }),
    /** 展示在复盘页提示框里的归档原因 */
    archiveReason: text("archive_reason"),
    sourceDate: date("source_date", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("memories_status_scope_idx").on(table.status, table.scope),
    index("memories_student_idx").on(table.studentId),
    index("memories_source_date_idx").on(table.sourceDate),
    index("memories_lifecycle_status_idx").on(
      table.lifecycle,
      table.status,
      table.expiresAt,
    ),
    index("memories_status_archive_after_idx").on(
      table.status,
      table.archiveAfter,
    ),
  ],
);

/** 每周一条周报，week_start 为周一，天然防止重复生成 */
export const weeklyReports = pgTable("weekly_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  weekStart: date("week_start", { mode: "string" }).notNull().unique(),
  weekEnd: date("week_end", { mode: "string" }).notNull(),
  content: jsonb("content").$type<WeeklyReportContent>().notNull(),
  status: text("status")
    .$type<WeeklyReportStatus>()
    .notNull()
    .default("draft"),
  sourceReviewCount: integer("source_review_count").notNull().default(0),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** 只记录数量、枚举和耗时，不记录复盘原文、学生姓名或问题内容 */
export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    event: text("event").notNull(),
    reviewDate: date("review_date", { mode: "string" }),
    properties: jsonb("properties")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("usage_events_event_created_idx").on(
      table.event,
      table.createdAt,
    ),
    index("usage_events_review_date_idx").on(table.reviewDate),
  ],
);

export type StudentRow = typeof students.$inferSelect;
export type ReviewRow = typeof reviews.$inferSelect;
export type SettingsRow = typeof settings.$inferSelect;
export type MemoryRow = typeof memories.$inferSelect;
export type WeeklyReportRow = typeof weeklyReports.$inferSelect;
export type UsageEventRow = typeof usageEvents.$inferSelect;
