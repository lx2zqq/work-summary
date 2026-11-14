import type {
  Memory,
  MemoryPromptItem,
  MemoryScope,
  Student,
} from "./types";

// 同一件事的不同说法大致在这个相似度以上，直接合并更新
export const MEMORY_MERGE_THRESHOLD = 0.42;

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
  const mentionedStudents = students.filter((student) =>
    corpus.includes(student.name),
  );
  const mentionedIds = new Set(
    mentionedStudents.map((student) => student.id),
  );

  return memories
    .filter((memory) => memory.status === "active")
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

  const byName = students.find((student) => student.name === name);
  return byName
    ? { studentId: byName.id, studentName: byName.name }
    : { studentId: null, studentName: name };
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
