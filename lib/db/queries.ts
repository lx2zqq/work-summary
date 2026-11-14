import "server-only";

import { desc, eq, lt } from "drizzle-orm";
import { normalizeDraft } from "@/lib/draft";
import type { StudentInput } from "@/lib/schema";
import { renderReview } from "@/lib/template";
import {
  DEFAULT_SETTINGS,
  emptyDraft,
  hasDraftContent,
  type AppSettings,
  type Memory,
  type MemoryInput,
  type QAPair,
  type ReviewDraft,
  type ReviewListItem,
  type ReviewRecord,
  type ReviewStyle,
  type Student,
  type StudentStatus,
} from "@/lib/types";
import { getDb } from "./index";
import {
  memories,
  reviews,
  settings as settingsTable,
  students,
} from "./schema";

function mapSettings(
  row: typeof settingsTable.$inferSelect,
): AppSettings {
  return {
    defaultStyle: row.defaultStyle,
    showJiaoyan: row.showJiaoyan,
    showKunnan: row.showKunnan,
    showFixedPhrase: row.showFixedPhrase,
    enableMemory: row.enableMemory,
  };
}

function mapMemory(row: typeof memories.$inferSelect): Memory {
  return {
    id: row.id,
    scope: row.scope,
    studentId: row.studentId,
    studentName: row.studentName,
    category: row.category,
    content: row.content,
    importance: row.importance,
    status: row.status,
    sourceDate: row.sourceDate,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapStudent(row: typeof students.$inferSelect): Student {
  return {
    id: row.id,
    name: row.name,
    grade: row.grade,
    subjects: row.subjects,
    status: row.status,
    note: row.note,
  };
}

function mapReview(
  row: typeof reviews.$inferSelect,
  settings?: AppSettings,
): ReviewRecord {
  const draft = row.draft ? normalizeDraft(row.draft) : emptyDraft();

  return {
    id: row.id,
    reviewDate: row.reviewDate,
    rawInput: row.rawInput,
    draft,
    finalText: settings
      ? draft.questions.length === 0 && hasDraftContent(draft)
        ? renderReview(draft, row.reviewDate, settings)
        : ""
      : row.finalText,
    style: row.style,
    conversation: Array.isArray(row.conversation) ? row.conversation : [],
    round: row.round ?? 0,
    memoryExtractedAt: row.memoryExtractedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getSettings(): Promise<AppSettings> {
  const rows = await getDb()
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.id, 1))
    .limit(1);

  if (rows[0]) return mapSettings(rows[0]);

  await getDb()
    .insert(settingsTable)
    .values({ id: 1, ...DEFAULT_SETTINGS })
    .onConflictDoNothing();

  const created = await getDb()
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.id, 1))
    .limit(1);

  return created[0] ? mapSettings(created[0]) : DEFAULT_SETTINGS;
}

export async function updateSettings(
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  await getSettings();

  await getDb()
    .update(settingsTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(settingsTable.id, 1));

  return getSettings();
}

export async function listStudents(): Promise<Student[]> {
  const rows = await getDb()
    .select()
    .from(students)
    .orderBy(students.createdAt);

  return rows.map(mapStudent);
}

export async function createStudent(input: StudentInput): Promise<Student> {
  const [row] = await getDb()
    .insert(students)
    .values({
      name: input.name,
      grade: input.grade,
      subjects: input.subjects,
      status: input.status as StudentStatus,
      note: input.note,
    })
    .returning();

  return mapStudent(row);
}

export async function updateStudent(
  id: string,
  input: StudentInput,
): Promise<Student | null> {
  const [row] = await getDb()
    .update(students)
    .set({
      name: input.name,
      grade: input.grade,
      subjects: input.subjects,
      status: input.status as StudentStatus,
      note: input.note,
      updatedAt: new Date(),
    })
    .where(eq(students.id, id))
    .returning();

  return row ? mapStudent(row) : null;
}

export async function deleteStudent(id: string): Promise<boolean> {
  const [row] = await getDb()
    .delete(students)
    .where(eq(students.id, id))
    .returning({ id: students.id });

  return Boolean(row);
}

export async function getReviewByDate(
  date: string,
): Promise<ReviewRecord | null> {
  const rows = await getDb()
    .select()
    .from(reviews)
    .where(eq(reviews.reviewDate, date))
    .limit(1);

  if (!rows[0]) return null;

  const settings = await getSettings();
  return mapReview(rows[0], settings);
}

export async function listReviews(limit = 50): Promise<ReviewListItem[]> {
  const rows = await getDb()
    .select({
      id: reviews.id,
      reviewDate: reviews.reviewDate,
      style: reviews.style,
      finalText: reviews.finalText,
      draft: reviews.draft,
      updatedAt: reviews.updatedAt,
    })
    .from(reviews)
    .orderBy(desc(reviews.reviewDate))
    .limit(limit);

  const settings = await getSettings();

  return rows.map((row) => {
    const draft = row.draft ? normalizeDraft(row.draft) : emptyDraft();

    return {
      id: row.id,
      reviewDate: row.reviewDate,
      style: row.style,
      finalText:
        draft.questions.length === 0 && hasDraftContent(draft)
          ? renderReview(draft, row.reviewDate, settings)
          : "",
      questions: draft.questions.length,
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

export async function getRecentReviews(
  beforeDate: string,
  limit = 2,
): Promise<Array<{ date: string; text: string }>> {
  const rows = await getDb()
    .select({
      reviewDate: reviews.reviewDate,
      finalText: reviews.finalText,
    })
    .from(reviews)
    .where(lt(reviews.reviewDate, beforeDate))
    .orderBy(desc(reviews.reviewDate))
    .limit(limit);

  return rows
    .filter((row) => row.finalText.trim().length > 0)
    .map((row) => ({ date: row.reviewDate, text: row.finalText }))
    .reverse();
}

export async function saveReview(input: {
  date: string;
  rawInput: string;
  draft: ReviewDraft;
  finalText: string;
  style: ReviewStyle;
  conversation: QAPair[];
  round: number;
}): Promise<ReviewRecord> {
  const [row] = await getDb()
    .insert(reviews)
    .values({
      reviewDate: input.date,
      rawInput: input.rawInput,
      draft: input.draft,
      finalText: input.finalText,
      style: input.style,
      conversation: input.conversation,
      round: input.round,
      status: "draft",
    })
    .onConflictDoUpdate({
      target: reviews.reviewDate,
      set: {
        rawInput: input.rawInput,
        draft: input.draft,
        finalText: input.finalText,
        style: input.style,
        conversation: input.conversation,
        round: input.round,
        status: "draft",
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!row) {
    throw new Error("保存复盘失败");
  }

  return mapReview(row);
}

export async function listMemories(limit = 300): Promise<Memory[]> {
  const rows = await getDb()
    .select()
    .from(memories)
    .orderBy(desc(memories.importance), desc(memories.updatedAt))
    .limit(limit);

  return rows.map(mapMemory);
}

export async function listActiveMemories(limit = 200): Promise<Memory[]> {
  const rows = await getDb()
    .select()
    .from(memories)
    .where(eq(memories.status, "active"))
    .orderBy(desc(memories.importance), desc(memories.updatedAt))
    .limit(limit);

  return rows.map(mapMemory);
}

export async function createMemory(input: MemoryInput): Promise<Memory> {
  const [row] = await getDb()
    .insert(memories)
    .values({
      scope: input.scope,
      studentId: input.studentId,
      studentName: input.studentName,
      category: input.category,
      content: input.content,
      importance: input.importance,
      sourceDate: input.sourceDate ?? null,
    })
    .returning();

  if (!row) throw new Error("保存记忆失败");

  return mapMemory(row);
}

export async function updateMemory(
  id: string,
  input: MemoryInput,
): Promise<Memory | null> {
  const [row] = await getDb()
    .update(memories)
    .set({
      scope: input.scope,
      studentId: input.studentId,
      studentName: input.studentName,
      category: input.category,
      content: input.content,
      importance: input.importance,
      status: "active",
      updatedAt: new Date(),
      ...(input.sourceDate !== undefined
        ? { sourceDate: input.sourceDate }
        : {}),
    })
    .where(eq(memories.id, id))
    .returning();

  return row ? mapMemory(row) : null;
}

export async function deleteMemory(id: string): Promise<boolean> {
  const [row] = await getDb()
    .delete(memories)
    .where(eq(memories.id, id))
    .returning({ id: memories.id });

  return Boolean(row);
}

export async function markMemoryExtracted(date: string): Promise<string> {
  const extractedAt = new Date();

  await getDb()
    .update(reviews)
    .set({ memoryExtractedAt: extractedAt })
    .where(eq(reviews.reviewDate, date));

  return extractedAt.toISOString();
}
