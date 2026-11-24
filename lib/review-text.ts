import type { Student } from "./types";

/** 去掉固定抬头：学管部工作复盘⬇️ / 2026年11月24日工作复盘 */
export function stripReviewHeader(text: string): string {
  return text
    .replace(/^\s*学管部工作复盘⬇️?\s*\n+/, "")
    .replace(
      /^\s*\d{4}(?:年\d{1,2}月\d{1,2}日|-\d{1,2}-\d{1,2})工作复盘\s*\n+/,
      "",
    )
    .trim();
}

/** 列表摘要：去掉抬头后取前几行，压成一段 */
export function reviewSummary(text: string, lines = 2): string {
  const body = stripReviewHeader(text);

  return body
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, lines)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 正文里出现过的学生，用于列表下方的浅色标签 */
export function matchStudents(text: string, students: Student[]): Student[] {
  return students.filter((student) => text.includes(student.name));
}

/** 2026-11-24 -> 24 */
export function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10));
}
