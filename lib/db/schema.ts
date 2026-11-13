import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type {
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
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type StudentRow = typeof students.$inferSelect;
export type ReviewRow = typeof reviews.$inferSelect;
export type SettingsRow = typeof settings.$inferSelect;
