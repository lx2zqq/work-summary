import "server-only";

import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { todayISO } from "@/lib/date";
import { normalizeDraft } from "@/lib/draft";
import type { ExtractedMemory, StudentInput } from "@/lib/schema";
import {
  MEMORY_MERGE_THRESHOLD,
  hasSameMemoryContent,
  memorySimilarity,
  resolveMemoryExpiry,
  resolveMemoryStudent,
} from "@/lib/memory";
import { renderReview } from "@/lib/template";
import {
  DEFAULT_SETTINGS,
  MEMORY_ARCHIVE_GRACE_DAYS,
  MEMORY_EXTEND_DAYS,
  emptyDraft,
  hasDraftContent,
  type AppSettings,
  type CustomPhrase,
  type Memory,
  type MemoryInput,
  type MemoryPromptItem,
  type MemoryScope,
  type QAPair,
  type ReviewDraft,
  type ReviewListItem,
  type ReviewRecord,
  type ReviewStyle,
  type Student,
  type StudentStatus,
  type WeeklyReport,
  type WeeklyReportContent,
  type WeeklyReportStatus,
  type WeeklySourceReview,
} from "@/lib/types";
import { getDb } from "./index";
import {
  memories,
  reviews,
  settings as settingsTable,
  students,
  weeklyReports,
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
    customPhrases: row.customPhrases ?? [],
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
    lifecycle: row.lifecycle,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    archiveAfter: row.archiveAfter?.toISOString() ?? null,
    archiveReason: row.archiveReason,
    sourceDate: row.sourceDate,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(now: Date, days: number): Date {
  return new Date(now.getTime() + days * DAY_MS);
}

/** 可以注入 Prompt 的记忆：状态活跃且没有过期 */
function activeMemoryWhere(now = new Date()) {
  return and(
    eq(memories.status, "active"),
    or(isNull(memories.expiresAt), gt(memories.expiresAt, now)),
  );
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

function mapWeeklyReport(
  row: typeof weeklyReports.$inferSelect,
): WeeklyReport {
  return {
    id: row.id,
    weekStart: row.weekStart,
    weekEnd: row.weekEnd,
    content: row.content,
    status: row.status,
    sourceReviewCount: row.sourceReviewCount,
    generatedAt: row.generatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** 转义 LIKE 通配符，避免用户输入的 % 和 _ 被当成模糊匹配 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
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
  const updatedAt = new Date();

  // 单条 upsert 完成「不存在则创建、存在则更新」，省掉前后两次查询
  const [row] = await getDb()
    .insert(settingsTable)
    .values({ id: 1, ...DEFAULT_SETTINGS, ...patch, updatedAt })
    .onConflictDoUpdate({
      target: settingsTable.id,
      set: { ...patch, updatedAt },
    })
    .returning();

  if (!row) throw new Error("保存设置失败");

  return mapSettings(row);
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
  return getDb().transaction(async (tx) => {
    const [existing] = await tx
      .select({ name: students.name })
      .from(students)
      .where(eq(students.id, id))
      .limit(1);

    if (!existing) return null;

    const [row] = await tx
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

    if (!row) return null;

    // 学生改名后，关联记忆里的冗余姓名也要同步，避免筛选和展示对不上
    if (existing.name !== row.name) {
      await tx
        .update(memories)
        .set({ studentName: row.name, updatedAt: new Date() })
        .where(
          and(
            eq(memories.studentId, id),
            or(
              isNull(memories.studentName),
              ne(memories.studentName, row.name),
            ),
          ),
        );
    }

    return mapStudent(row);
  });
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
  preloadedSettings?: AppSettings,
): Promise<ReviewRecord | null> {
  const rows = await getDb()
    .select()
    .from(reviews)
    .where(eq(reviews.reviewDate, date))
    .limit(1);

  if (!rows[0]) return null;

  const settings = preloadedSettings ?? (await getSettings());
  return mapReview(rows[0], settings);
}

/** 导出单次最多返回的复盘篇数，超出时接口会带 X-Export-Truncated 提示 */
export const MAX_EXPORT_REVIEWS = 2000;

/** 数据备份用：完整复盘记录，包含 rawInput / draft / conversation */
export async function listReviewsForExport(
  limit = MAX_EXPORT_REVIEWS,
): Promise<ReviewRecord[]> {
  const safeLimit = Math.min(
    Math.max(1, Math.trunc(limit)),
    MAX_EXPORT_REVIEWS,
  );

  const rows = await getDb()
    .select()
    .from(reviews)
    .orderBy(desc(reviews.reviewDate))
    .limit(safeLimit);

  const settings = await getSettings();

  return rows.map((row) => mapReview(row, settings));
}

/** 历史页头部统计：总篇数和本月有复盘的天数（单次条件聚合） */
export async function getReviewStats(): Promise<{
  total: number;
  monthDays: number;
}> {
  const monthStart = `${todayISO().slice(0, 7)}-01`;

  const [row] = await getDb()
    .select({
      total: count(),
      monthDays: sql<number>`count(distinct case when ${reviews.reviewDate} >= ${monthStart} then ${reviews.reviewDate} end)`,
    })
    .from(reviews);

  return {
    total: Number(row?.total ?? 0),
    monthDays: Number(row?.monthDays ?? 0),
  };
}

export async function deleteReview(id: string): Promise<boolean> {
  const [row] = await getDb()
    .delete(reviews)
    .where(eq(reviews.id, id))
    .returning({ id: reviews.id });

  return Boolean(row);
}

/** 学生页只要日期和正文，不需要重渲染整份草稿 */
export async function listReviewSnippets(
  limit = 500,
): Promise<Array<{ id: string; reviewDate: string; finalText: string }>> {
  const rows = await getDb()
    .select({
      id: reviews.id,
      reviewDate: reviews.reviewDate,
      finalText: reviews.finalText,
    })
    .from(reviews)
    .orderBy(desc(reviews.reviewDate))
    .limit(limit);

  return rows.filter((row) => row.finalText.trim().length > 0);
}

export async function listReviews(
  limit = 50,
  beforeDate?: string,
  preloadedSettings?: AppSettings,
): Promise<ReviewListItem[]> {
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
    .where(beforeDate ? lt(reviews.reviewDate, beforeDate) : undefined)
    .orderBy(desc(reviews.reviewDate))
    .limit(limit);

  const settings = preloadedSettings ?? (await getSettings());

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

/** 周报面板只需要来源日期，避免把整篇正文拉回来 */
export async function listReviewDatesInRange(
  startDate: string,
  endDate: string,
): Promise<string[]> {
  const rows = await getDb()
    .select({ reviewDate: reviews.reviewDate })
    .from(reviews)
    .where(
      and(
        gte(reviews.reviewDate, startDate),
        lte(reviews.reviewDate, endDate),
      ),
    )
    .orderBy(reviews.reviewDate);

  return rows.map((row) => row.reviewDate);
}

/** 周报生成需要完整日报内容，按日期升序，保证模型按时间线归纳 */
export async function listWeeklySourceReviews(
  startDate: string,
  endDate: string,
): Promise<WeeklySourceReview[]> {
  const rows = await getDb()
    .select({
      reviewDate: reviews.reviewDate,
      finalText: reviews.finalText,
      draft: reviews.draft,
      rawInput: reviews.rawInput,
    })
    .from(reviews)
    .where(
      and(
        gte(reviews.reviewDate, startDate),
        lte(reviews.reviewDate, endDate),
      ),
    )
    .orderBy(reviews.reviewDate);

  return rows.map((row) => ({
    reviewDate: row.reviewDate,
    finalText: row.finalText,
    draft: row.draft ? normalizeDraft(row.draft) : emptyDraft(),
    rawInput: row.rawInput,
  }));
}

/** 周报只统计在读学员，和记忆、复盘查询分开，避免把停课学生算进去 */
export async function listActiveStudents(): Promise<Student[]> {
  const rows = await getDb()
    .select()
    .from(students)
    .where(eq(students.status, "在读"))
    .orderBy(students.createdAt);

  return rows.map(mapStudent);
}

export async function getWeeklyReport(
  weekStart: string,
): Promise<WeeklyReport | null> {
  const [row] = await getDb()
    .select()
    .from(weeklyReports)
    .where(eq(weeklyReports.weekStart, weekStart))
    .limit(1);

  return row ? mapWeeklyReport(row) : null;
}

/** 生成和手动保存共用同一个 upsert，week_start 唯一约束保证一周只有一条 */
export async function saveWeeklyReport(input: {
  weekStart: string;
  weekEnd: string;
  content: WeeklyReportContent;
  status: WeeklyReportStatus;
  sourceReviewCount: number;
  generatedAt: Date | null;
}): Promise<WeeklyReport> {
  const now = new Date();

  const [row] = await getDb()
    .insert(weeklyReports)
    .values({
      weekStart: input.weekStart,
      weekEnd: input.weekEnd,
      content: input.content,
      status: input.status,
      sourceReviewCount: input.sourceReviewCount,
      generatedAt: input.generatedAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: weeklyReports.weekStart,
      set: {
        weekEnd: input.weekEnd,
        content: input.content,
        status: input.status,
        sourceReviewCount: input.sourceReviewCount,
        generatedAt: input.generatedAt,
        updatedAt: now,
      },
    })
    .returning();

  if (!row) throw new Error("保存周报失败");

  return mapWeeklyReport(row);
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

/** 单次记忆列表的硬上限，避免一次把整库拉进内存 */
export const MAX_MEMORY_PAGE = 1000;

export async function listMemories(limit = 300): Promise<Memory[]> {
  const safeLimit = Math.min(Math.max(1, Math.trunc(limit)), MAX_MEMORY_PAGE);

  const rows = await getDb()
    .select()
    .from(memories)
    .orderBy(desc(memories.importance), desc(memories.updatedAt))
    .limit(safeLimit);

  return rows.map(mapMemory);
}

/**
 * 惰性推进记忆生命周期，避免依赖外部定时任务：
 * 1. 阶段性记忆过期 → 进入 5 天待归档宽限期；
 * 2. 宽限期结束 → 自动软归档。
 * 两段串行执行，不并发占用 Supabase 连接。
 */
export async function syncMemoryLifecycle(
  now = new Date(),
): Promise<{ pending: number; archived: number }> {
  const pendingRows = await getDb()
    .update(memories)
    .set({
      status: "pending_archive",
      archiveAfter: addDays(now, MEMORY_ARCHIVE_GRACE_DAYS),
      archiveReason: "已过建议时效",
      updatedAt: now,
    })
    .where(
      and(
        eq(memories.status, "active"),
        eq(memories.lifecycle, "ephemeral"),
        isNotNull(memories.expiresAt),
        lte(memories.expiresAt, now),
      ),
    )
    .returning({ id: memories.id });

  const archivedRows = await getDb()
    .update(memories)
    .set({ status: "archived", updatedAt: now })
    .where(
      and(
        eq(memories.status, "pending_archive"),
        isNotNull(memories.archiveAfter),
        lte(memories.archiveAfter, now),
      ),
    )
    .returning({ id: memories.id });

  return {
    pending: pendingRows.length,
    archived: archivedRows.length,
  };
}

/** 用户主动保留：转为长期记忆，或顺延 7 天有效期 */
export async function keepMemory(
  id: string,
  mode: "permanent" | "extend_7d",
): Promise<Memory | null> {
  const now = new Date();
  const permanent = mode === "permanent";

  const [row] = await getDb()
    .update(memories)
    .set({
      status: "active",
      lifecycle: permanent ? "permanent" : "ephemeral",
      expiresAt: permanent ? null : addDays(now, MEMORY_EXTEND_DAYS),
      archiveAfter: null,
      archiveReason: null,
      updatedAt: now,
    })
    .where(eq(memories.id, id))
    .returning();

  return row ? mapMemory(row) : null;
}

/** 用户立即归档，不再等待宽限期 */
export async function archiveMemory(id: string): Promise<Memory | null> {
  const now = new Date();

  const [row] = await getDb()
    .update(memories)
    .set({
      status: "archived",
      archiveAfter: null,
      archiveReason: "手动归档",
      updatedAt: now,
    })
    .where(eq(memories.id, id))
    .returning();

  return row ? mapMemory(row) : null;
}

/** 从已归档恢复。默认转为长期记忆，避免恢复后立刻再次过期 */
export async function restoreMemory(id: string): Promise<Memory | null> {
  const now = new Date();

  const [row] = await getDb()
    .update(memories)
    .set({
      status: "active",
      lifecycle: "permanent",
      expiresAt: null,
      archiveAfter: null,
      archiveReason: null,
      updatedAt: now,
    })
    .where(eq(memories.id, id))
    .returning();

  return row ? mapMemory(row) : null;
}

export async function listActiveMemories(limit = 200): Promise<Memory[]> {
  await syncMemoryLifecycle();

  const rows = await getDb()
    .select()
    .from(memories)
    .where(activeMemoryWhere())
    .orderBy(desc(memories.importance), desc(memories.updatedAt))
    .limit(limit);

  return rows.map(mapMemory);
}

/** 待归档记忆，按宽限期截止时间升序，最快过期的排前面 */
export async function listPendingArchiveMemories(
  limit = 50,
): Promise<Memory[]> {
  const rows = await getDb()
    .select()
    .from(memories)
    .where(eq(memories.status, "pending_archive"))
    .orderBy(memories.archiveAfter)
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
      lifecycle: input.lifecycle ?? "permanent",
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      sourceDate: input.sourceDate ?? null,
    })
    .returning();

  if (!row) throw new Error("保存记忆失败");

  return mapMemory(row);
}

export async function updateMemory(
  id: string,
  input: MemoryInput & { status?: Memory["status"] },
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
      // 不传 status 时保留数据库里的原值，避免把已归档的记忆重新激活
      ...(input.status ? { status: input.status } : {}),
      ...(input.lifecycle ? { lifecycle: input.lifecycle } : {}),
      ...(input.expiresAt !== undefined
        ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null }
        : {}),
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

/** 工具 search_students 的查询实现：所有条件都是可选的模糊/等值匹配 */
export async function findStudents(input: {
  query?: string;
  status?: StudentStatus;
  grade?: string;
  limit?: number;
}): Promise<Student[]> {
  const conditions = [];

  if (input.query) {
    conditions.push(ilike(students.name, `%${escapeLike(input.query)}%`));
  }
  if (input.status) {
    conditions.push(eq(students.status, input.status));
  }
  if (input.grade) {
    conditions.push(ilike(students.grade, `%${escapeLike(input.grade)}%`));
  }

  const rows = await getDb()
    .select()
    .from(students)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(students.createdAt)
    .limit(input.limit ?? 20);

  return rows.map(mapStudent);
}

/** 工具 search_memories 的查询实现：不传条件时返回重要度最高的几条 */
export async function findMemories(input: {
  studentName?: string;
  keyword?: string;
  scope?: MemoryScope;
  limit?: number;
}): Promise<MemoryPromptItem[]> {
  const now = new Date();
  const conditions = [
    eq(memories.status, "active"),
    or(isNull(memories.expiresAt), gt(memories.expiresAt, now)),
  ];

  if (input.studentName) {
    conditions.push(
      ilike(memories.studentName, `%${escapeLike(input.studentName)}%`),
    );
  }
  if (input.keyword) {
    conditions.push(ilike(memories.content, `%${escapeLike(input.keyword)}%`));
  }
  if (input.scope) {
    conditions.push(eq(memories.scope, input.scope));
  }

  const rows = await getDb()
    .select()
    .from(memories)
    .where(and(...conditions))
    .orderBy(desc(memories.importance), desc(memories.updatedAt))
    .limit(input.limit ?? 8);

  return rows.map((row) => ({
    id: row.id,
    scope: row.scope,
    studentName: row.studentName,
    category: row.category,
    content: row.content,
    importance: row.importance,
  }));
}

/** 工具 search_reviews 的查询实现：按关键词和日期范围查历史正文 */
export async function findReviews(input: {
  keyword?: string;
  beforeDate?: string;
  afterDate?: string;
  limit?: number;
}): Promise<Array<{ date: string; text: string }>> {
  const conditions = [];

  if (input.beforeDate) {
    conditions.push(lt(reviews.reviewDate, input.beforeDate));
  }
  if (input.afterDate) {
    conditions.push(gte(reviews.reviewDate, input.afterDate));
  }
  if (input.keyword) {
    conditions.push(ilike(reviews.finalText, `%${escapeLike(input.keyword)}%`));
  }

  const rows = await getDb()
    .select({
      reviewDate: reviews.reviewDate,
      finalText: reviews.finalText,
    })
    .from(reviews)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(reviews.reviewDate))
    .limit(input.limit ?? 2);

  return rows
    .filter((row) => row.finalText.trim().length > 0)
    .map((row) => ({ date: row.reviewDate, text: row.finalText }));
}

export async function markMemoryExtracted(date: string): Promise<string> {
  const extractedAt = new Date();

  await getDb()
    .update(reviews)
    .set({ memoryExtractedAt: extractedAt })
    .where(eq(reviews.reviewDate, date));

  return extractedAt.toISOString();
}

export type CustomPhraseMutationResult =
  | { next: CustomPhrase[] }
  | { error: string; status?: number };

/**
 * 在事务里读取并更新自定义话术。
 * 先对 settings 行加锁，避免两个请求同时读到旧数组后互相覆盖。
 */
export async function mutateCustomPhrases(
  mutate: (current: CustomPhrase[]) => CustomPhraseMutationResult,
): Promise<
  | { ok: true; phrases: CustomPhrase[] }
  | { ok: false; error: string; status: number }
> {
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.id, 1))
      .limit(1)
      .for("update");

    const current = row ? mapSettings(row).customPhrases : [];
    const result = mutate(current);

    if ("error" in result) {
      return {
        ok: false as const,
        error: result.error,
        status: result.status ?? 400,
      };
    }

    const updatedAt = new Date();
    const [updated] = await tx
      .insert(settingsTable)
      .values({
        id: 1,
        ...DEFAULT_SETTINGS,
        customPhrases: result.next,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: settingsTable.id,
        set: { customPhrases: result.next, updatedAt },
      })
      .returning();

    if (!updated) throw new Error("保存话术失败");

    return {
      ok: true as const,
      phrases: mapSettings(updated).customPhrases,
    };
  });
}

/**
 * 事务内写入提取出的记忆，并标记复盘已提取。
 * 中途失败会整体回滚，不会出现“记忆写了但标记没更新”的半截状态。
 */
export async function saveExtractedMemories(input: {
  date: string;
  items: ExtractedMemory[];
  students: Student[];
}): Promise<{ created: number; updated: number; extractedAt: string }> {
  return getDb().transaction(async (tx) => {
    const now = new Date();
    const rows = await tx
      .select()
      .from(memories)
      .where(activeMemoryWhere(now))
      .orderBy(desc(memories.importance), desc(memories.updatedAt))
      .limit(200)
      .for("update");

    const existing = rows.map(mapMemory);
    /** 本轮新建的记忆也参与后续去重比较 */
    const working = [...existing];
    const createdIds: string[] = [];
    const touchedIds = new Set<string>();

    const sameStudent = (
      memory: Memory,
      resolved: { studentId: string | null; studentName: string | null },
    ) => {
      if (resolved.studentId) {
        return memory.studentId === resolved.studentId;
      }

      return (
        memory.studentId === null &&
        memory.studentName === resolved.studentName
      );
    };

    const updateById = async (
      id: string,
      item: ExtractedMemory,
      resolved: { studentId: string | null; studentName: string | null },
    ) => {
      const lifecycle = item.lifecycle ?? "permanent";
      const expiresAt = resolveMemoryExpiry({
        lifecycle,
        ttlDays: item.ttlDays,
        now,
      });

      const [row] = await tx
        .update(memories)
        .set({
          scope: item.scope,
          studentId: resolved.studentId,
          studentName: resolved.studentName,
          category: item.category,
          content: item.content,
          importance: item.importance,
          lifecycle,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          // 更新为长期后不应残留旧的归档倒计时
          ...(lifecycle === "permanent"
            ? { archiveAfter: null, archiveReason: null }
            : {}),
          sourceDate: input.date,
          updatedAt: new Date(),
        })
        .where(eq(memories.id, id))
        .returning({ id: memories.id });

      if (row) touchedIds.add(row.id);
    };

    for (const item of input.items) {
      const resolved = resolveMemoryStudent(item, input.students);

      if (item.scope === "student" && !resolved.studentName) continue;

      const existingById = item.id
        ? existing.find((memory) => memory.id === item.id)
        : null;

      if (existingById) {
        await updateById(existingById.id, item, resolved);
        continue;
      }

      const duplicate = working.find(
        (memory) =>
          memory.scope === item.scope &&
          sameStudent(memory, resolved) &&
          hasSameMemoryContent(memory, item.content),
      );

      if (duplicate) continue;

      // 模型没按 id 更新时，用相似度兜底合并同一件事的不同说法
      const similar = working
        .filter(
          (memory) =>
            memory.scope === item.scope &&
            memory.category === item.category &&
            sameStudent(memory, resolved),
        )
        .map((memory) => ({
          memory,
          score: memorySimilarity(memory.content, item.content),
        }))
        .filter((entry) => entry.score >= MEMORY_MERGE_THRESHOLD)
        .sort((a, b) => b.score - a.score)[0]?.memory;

      if (similar) {
        await updateById(similar.id, item, resolved);
        continue;
      }

      const lifecycle = item.lifecycle ?? "permanent";
      const expiresAt = resolveMemoryExpiry({
        lifecycle,
        ttlDays: item.ttlDays,
        now,
      });

      const [created] = await tx
        .insert(memories)
        .values({
          scope: item.scope,
          studentId: resolved.studentId,
          studentName: resolved.studentName,
          category: item.category,
          content: item.content,
          importance: item.importance,
          lifecycle,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          sourceDate: input.date,
        })
        .returning();

      if (created) {
        createdIds.push(created.id);
        touchedIds.add(created.id);
        working.push(mapMemory(created));
      }
    }

    const extractedAt = new Date();
    await tx
      .update(reviews)
      .set({ memoryExtractedAt: extractedAt })
      .where(eq(reviews.reviewDate, input.date));

    return {
      created: createdIds.length,
      updated: Math.max(0, touchedIds.size - createdIds.length),
      extractedAt: extractedAt.toISOString(),
    };
  });
}
