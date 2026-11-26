import { formatDateCN } from "./date";
import type { Memory, ReviewRecord, Student } from "./types";

/** 记忆内容压成一行，避免换行破坏列表结构 */
function normalizeInline(text: string): string {
  return text.replace(/\s*\n+\s*/g, " ").trim();
}

/** 复盘正文用引用块输出，避免正文里的 #、- 被 Markdown 当成结构 */
function quoteBlock(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => `> ${line.trimEnd()}`)
    .join("\n");
}

function studentStatusLabel(status: Student["status"] | null | undefined) {
  return status || "未知";
}

/** 设置页「导出 Markdown」用的人类可读备份 */
export function buildBackupMarkdown(input: {
  exportedAt: string;
  students: Student[];
  memories: Memory[];
  reviews: ReviewRecord[];
}): string {
  const lines: string[] = [
    "# 学管复盘助手 · 数据备份",
    "",
    `导出时间：${input.exportedAt}`,
    "",
    "## 长期记忆",
    "",
  ];

  const studentById = new Map(
    input.students.map((student) => [student.id, student]),
  );
  // 优先按 studentId 分组，同名但不同学生不会被合并成一组
  const groups = new Map<string, { title: string; items: Memory[] }>();

  for (const memory of input.memories) {
    let key: string;
    let title: string;

    if (memory.scope === "general") {
      key = "general";
      title = "通用记忆";
    } else if (memory.studentId) {
      key = `id:${memory.studentId}`;
      title =
        studentById.get(memory.studentId)?.name ??
        memory.studentName ??
        "未关联学生";
    } else {
      key = `name:${memory.studentName ?? ""}`;
      title = memory.studentName ?? "未关联学生";
    }

    const bucket = groups.get(key) ?? { title, items: [] };
    bucket.items.push(memory);
    groups.set(key, bucket);
  }

  if (groups.size === 0) {
    lines.push("（还没有长期记忆）", "");
  } else {
    for (const { title, items } of groups.values()) {
      lines.push(`### ${title}`, "");

      for (const memory of items) {
        const source = memory.sourceDate
          ? formatDateCN(memory.sourceDate)
          : "手动添加";
        const archived = memory.status === "archived" ? "（已归档）" : "";
        const importance = Math.min(3, Math.max(1, memory.importance));

        lines.push(
          `- [${memory.category}] 重要度 ${importance}/3 · ${source}${archived}：${normalizeInline(memory.content)}`,
        );
      }

      lines.push("");
    }
  }

  lines.push("## 历史复盘", "");

  const reviews = input.reviews.filter((review) => review.finalText.trim());

  if (reviews.length === 0) {
    lines.push("（还没有历史复盘）", "");
  } else {
    for (const review of reviews) {
      lines.push(
        `### ${formatDateCN(review.reviewDate)}（${review.style === "concise" ? "简洁" : "详细"}）`,
        "",
        quoteBlock(review.finalText.trim()),
        "",
      );
    }
  }

  const studentLine =
    input.students
      .map(
        (student) =>
          `${student.name}（${studentStatusLabel(student.status)}）`,
      )
      .join("、") || "暂无";

  lines.push("---", "", `学生名单：${studentLine}`, "");

  return lines.join("\n");
}
