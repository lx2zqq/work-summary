import { formatDateCN } from "./date";
import type { Memory, ReviewRecord, Student } from "./types";

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

  const groups = new Map<string, Memory[]>();

  for (const memory of input.memories) {
    const key =
      memory.scope === "student"
        ? memory.studentName ?? "未关联学生"
        : "通用记忆";
    const bucket = groups.get(key) ?? [];
    bucket.push(memory);
    groups.set(key, bucket);
  }

  if (groups.size === 0) {
    lines.push("（还没有长期记忆）", "");
  } else {
    for (const [title, items] of groups) {
      lines.push(`### ${title}`, "");

      for (const memory of items) {
        const source = memory.sourceDate
          ? formatDateCN(memory.sourceDate)
          : "手动添加";
        const archived = memory.status === "archived" ? "（已归档）" : "";
        const importance = Math.min(3, Math.max(1, memory.importance));

        lines.push(
          `- [${memory.category}] 重要度 ${importance}/3 · ${source}${archived}：${memory.content}`,
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
        review.finalText.trim(),
        "",
      );
    }
  }

  lines.push(
    "---",
    "",
    `学生名单：${input.students.map((student) => `${student.name}（${student.status}）`).join("、") || "暂无"}`,
    "",
  );

  return lines.join("\n");
}
