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
  MemoryCategory,
  MemoryScope,
  QAPair,
  ReviewDraft,
  ReviewStyle,
  StudentStatus,
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
  showFixedPhrase: boolean("show_fixed_phrase").notNull().default(false),
  enableMemory: boolean("enable_memory").notNull().default(true),
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
      .$type<"active" | "archived">()
      .notNull()
      .default("active"),
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
  ],
);

export type StudentRow = typeof students.$inferSelect;
export type ReviewRow = typeof reviews.$inferSelect;
export type SettingsRow = typeof settings.$inferSelect;
export type MemoryRow = typeof memories.$inferSelect;
