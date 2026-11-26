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

function isHanChar(value: string | undefined): boolean {
  return Boolean(value && /[一-鿿]/.test(value));
}

/**
 * 正文里出现过的学生，用于列表下方的浅色标签。
 * 单字姓名容易误命中别的词（例如“王”命中“王府井”），
 * 要求匹配位置前后都不是汉字；空姓名直接跳过。
 */
export function matchStudents(text: string, students: Student[]): Student[] {
  return students.filter((student) => {
    const name = student.name.trim();
    if (!name) return false;
    if (name.length > 1) return text.includes(name);

    let index = text.indexOf(name);

    while (index >= 0) {
      const before = text[index - 1];
      const after = text[index + name.length];

      if (!isHanChar(before) && !isHanChar(after)) return true;
      index = text.indexOf(name, index + 1);
    }

    return false;
  });
}

/** 2026-11-24 -> 24 */
export function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10));
}
