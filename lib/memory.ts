import { todayISO } from "./date";
import {
  MEMORY_DEFAULT_TTL_DAYS,
  MEMORY_MAX_TTL_DAYS,
  type Memory,
  type MemoryLifecycle,
  type MemoryPromptItem,
  type MemoryScope,
  type Student,
} from "./types";

// 同一件事的不同说法大致在这个相似度以上，直接合并更新
export const MEMORY_MERGE_THRESHOLD = 0.42;

const DAY_MS = 24 * 60 * 60 * 1000;

const IMPORTANCE_LABELS = ["一般", "重要", "很重要"] as const;

/**
 * 根据生命周期计算过期时间。
 * permanent 返回 null；ephemeral 按 ttlDays 往后推，默认 7 天，最长 90 天。
 */
export function resolveMemoryExpiry(input: {
  lifecycle?: MemoryLifecycle;
  ttlDays?: number | null;
  now?: Date;
}): string | null {
  if ((input.lifecycle ?? "permanent") !== "ephemeral") return null;

  const rawDays = input.ttlDays ?? MEMORY_DEFAULT_TTL_DAYS;
  const days = Number.isFinite(rawDays)
    ? Math.min(MEMORY_MAX_TTL_DAYS, Math.max(1, Math.round(rawDays)))
    : MEMORY_DEFAULT_TTL_DAYS;

  return new Date(
    (input.now ?? new Date()).getTime() + days * DAY_MS,
  ).toISOString();
}

/** 重要度统一展示：实心圆点 + 中文标签，避免 2/3 这种机械写法 */
export function formatMemoryImportance(importance: number): {
  dots: string;
  label: string;
} {
  const level = Math.min(3, Math.max(1, Math.round(importance)));

  return {
    dots: `${"●".repeat(level)}${"○".repeat(3 - level)}`,
    label: IMPORTANCE_LABELS[level - 1] ?? "一般",
  };
}

export type MemoryCopyAction = "none" | "first" | "refresh";

/**
 * 复制复盘时是否需要整理记忆：
 * - 从未提取过：首次记忆
 * - 正文在上次记忆后有更新：刷新记忆
 * - 其余情况不调用 AI
 */
export function resolveMemoryCopyAction(input: {
  enabled: boolean;
  extractedAt: string | null;
  stale: boolean;
}): MemoryCopyAction {
  if (!input.enabled) return "none";
  if (!input.extractedAt) return "first";
  return input.stale ? "refresh" : "none";
}

/**
 * 正文在最近一次记忆提取之后又保存过，就认为记忆需要更新。
 * 时间缺失或格式异常时按“需要更新”处理，避免漏记。
 */
export function isMemoryExtractionStale(input: {
  extractedAt: string | null;
  updatedAt: string;
}): boolean {
  if (!input.extractedAt) return true;

  const extracted = new Date(input.extractedAt).getTime();
  const updated = new Date(input.updatedAt).getTime();

  if (!Number.isFinite(extracted) || !Number.isFinite(updated)) return true;

  return updated > extracted;
}

/**
 * 阶段性记忆剩余天数；无过期时间或格式异常时返回空串。
 * 按上海时区的自然日计算，避免“3 天后到期”显示成“剩余 4 天”。
 */
export function formatMemoryRemaining(
  expiresAt: string | null,
  now: Date = new Date(),
): string {
  if (!expiresAt) return "";

  const target = new Date(expiresAt);
  if (!Number.isFinite(target.getTime())) return "";

  const start = Date.parse(todayISO(now));
  const end = Date.parse(todayISO(target));
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "";

  const days = Math.max(0, Math.round((end - start) / DAY_MS));
  return days === 0 ? "今天到期" : `剩余 ${days} 天`;
}

export function normalizeMemoryText(value: string): string {
  return value
    .replace(/[\s，。！？、；：""''（）()【】《》]/g, "")
    .toLowerCase();
}

/**
 * 生成时只带“通用记忆 + 今天提到的学生的记忆”，避免无关信息干扰模型。
 */
export function selectMemoriesForPrompt(
  memories: Memory[],
  options: { corpus: string; students: Student[]; limit?: number },
): MemoryPromptItem[] {
  const { corpus, students, limit = 40 } = options;
  const now = Date.now();
  const mentionedStudents = students.filter((student) =>
    corpus.includes(student.name),
  );
  const mentionedIds = new Set(
    mentionedStudents.map((student) => student.id),
  );

  return memories
    .filter((memory) => memory.status === "active")
    // 预注入路径的第二道保险：已过期但还没被惰性同步的记忆也不进 Prompt
    .filter((memory) => {
      if (!memory.expiresAt) return true;
      const expiresAt = new Date(memory.expiresAt).getTime();
      return Number.isFinite(expiresAt) && expiresAt > now;
    })
    .filter(
      (memory) =>
        memory.scope === "general" ||
        (memory.studentId !== null &&
          mentionedIds.has(memory.studentId)) ||
        // 学生不在名单里时，记忆可能只有名字，也要能匹配
        (memory.studentName !== null &&
          corpus.includes(memory.studentName)),
    )
    .sort(
      (a, b) =>
        b.importance - a.importance ||
        b.updatedAt.localeCompare(a.updatedAt),
    )
    .slice(0, limit)
    .map(({ id, scope, studentName, category, content, importance }) => ({
      id,
      scope,
      studentName,
      category,
      content,
      importance,
    }));
}

export function formatMemoriesForPrompt(
  items: MemoryPromptItem[],
): string {
  if (items.length === 0) return "";

  return items
    .map((item) => {
      const who =
        item.scope === "student"
          ? item.studentName || "未关联学生"
          : "通用";
      return `- [${who}] ${item.content}（${item.category}，重要度 ${item.importance}）`;
    })
    .join("\n");
}

export function resolveMemoryStudent(
  input: {
    scope: MemoryScope;
    studentId?: string | null;
    studentName?: string | null;
  },
  students: Student[],
): { studentId: string | null; studentName: string | null } {
  if (input.scope === "general") {
    return { studentId: null, studentName: null };
  }

  if (input.studentId) {
    const byId = students.find(
      (student) => student.id === input.studentId,
    );
    if (byId) return { studentId: byId.id, studentName: byId.name };
  }

  const name = input.studentName?.trim();
  if (!name) return { studentId: null, studentName: null };

  const byName = students.filter((student) => student.name === name);

  // 同名学生会撞车：只有唯一匹配时才绑定 id，否则只保留名字
  if (byName.length === 1) {
    return { studentId: byName[0].id, studentName: byName[0].name };
  }

  return { studentId: null, studentName: name };
}

export function hasSameMemoryContent(
  memory: Memory,
  content: string,
): boolean {
  return normalizeMemoryText(memory.content) === normalizeMemoryText(content);
}

function bigrams(value: string): Set<string> {
  if (value.length <= 2) return new Set([value]);

  const result = new Set<string>();

  for (let index = 0; index < value.length - 1; index += 1) {
    result.add(value.slice(index, index + 2));
  }

  return result;
}

/**
 * 用字符二元组 Dice 系数判断两条记忆是不是同一件事的不同说法。
 * 模型有时不按 id 更新，这里做一层兜底，避免越记越多、状态互相矛盾。
 */
export function memorySimilarity(a: string, b: string): number {
  const left = normalizeMemoryText(a);
  const right = normalizeMemoryText(b);

  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftGrams = bigrams(left);
  const rightGrams = bigrams(right);
  let intersection = 0;

  for (const gram of leftGrams) {
    if (rightGrams.has(gram)) intersection += 1;
  }

  return (2 * intersection) / (leftGrams.size + rightGrams.size);
}
