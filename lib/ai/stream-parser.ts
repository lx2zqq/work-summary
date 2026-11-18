import { SECTION_ORDER, type SectionKey } from "@/lib/types";

export type SectionStreamEntry = {
  key: SectionKey;
  items: string[];
};

const SECTION_SET = new Set<string>(SECTION_ORDER);

function isSectionKey(value: string): value is SectionKey {
  return SECTION_SET.has(value);
}

function skipWhitespace(text: string, index: number): number {
  let cursor = index;

  while (cursor < text.length && /\s/.test(text[cursor] ?? "")) {
    cursor += 1;
  }

  return cursor;
}

/** 读取一个完整的 JSON 字符串，返回内容和结束位置；未闭合时返回 null */
function readString(
  text: string,
  index: number,
): { value: string; next: number } | null {
  if (text[index] !== '"') return null;

  let cursor = index + 1;
  let escaped = false;

  while (cursor < text.length) {
    const char = text[cursor];

    if (escaped) {
      escaped = false;
      cursor += 1;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      cursor += 1;
      continue;
    }

    if (char === '"') {
      const raw = text.slice(index, cursor + 1);

      try {
        return { value: JSON.parse(raw) as string, next: cursor + 1 };
      } catch {
        return null;
      }
    }

    cursor += 1;
  }

  // 字符串还没闭合，等下一个 chunk
  return null;
}

/**
 * 从还没收完的 JSON 文本里，提取所有已经闭合的 section 条目。
 *
 * 只认 `"sections": { "xueqing": ["...", "..."] }` 这种结构；
 * 半截的字符串、还没闭合的数组都不会返回，保证前端拿到的每一句都是完整的。
 * 每次调用都从头扫一遍，调用方自己对比增量。
 */
export function parsePartialSections(buffer: string): SectionStreamEntry[] {
  const sectionsIndex = buffer.indexOf('"sections"');
  if (sectionsIndex < 0) return [];

  let cursor = buffer.indexOf("{", sectionsIndex);
  if (cursor < 0) return [];
  cursor += 1;

  const result: SectionStreamEntry[] = [];

  while (cursor < buffer.length) {
    cursor = skipWhitespace(buffer, cursor);

    if (buffer[cursor] === ",") {
      cursor += 1;
      continue;
    }

    // 读到对象结尾，说明 sections 已经完整
    if (buffer[cursor] !== '"') break;

    const keyResult = readString(buffer, cursor);
    if (!keyResult) break;
    const key = keyResult.value;
    cursor = keyResult.next;

    cursor = skipWhitespace(buffer, cursor);
    if (buffer[cursor] !== ":") break;
    cursor += 1;
    cursor = skipWhitespace(buffer, cursor);

    if (buffer[cursor] !== "[") {
      // 不是数组的字段（比如 notes）直接跳过，不做深解析
      break;
    }

    cursor += 1;
    const items: string[] = [];
    let arrayClosed = false;

    while (cursor < buffer.length) {
      cursor = skipWhitespace(buffer, cursor);

      if (buffer[cursor] === ",") {
        cursor += 1;
        continue;
      }

      if (buffer[cursor] === "]") {
        cursor += 1;
        arrayClosed = true;
        break;
      }

      if (buffer[cursor] !== '"') break;

      const itemResult = readString(buffer, cursor);
      if (!itemResult) break;

      const value = itemResult.value.trim();
      if (value) items.push(value);
      cursor = itemResult.next;
    }

    if (isSectionKey(key) && items.length > 0) {
      result.push({ key, items });
    }

    if (!arrayClosed) break;
  }

  return result;
}

/**
 * 把每次解析结果和上一次对比，只返回新增的条目。
 * 前端收到的事件就是增量，不需要自己再比对。
 */
export function diffSections(
  previous: SectionStreamEntry[],
  next: SectionStreamEntry[],
): SectionStreamEntry[] {
  const counts = new Map<SectionKey, number>();

  for (const entry of previous) {
    counts.set(entry.key, entry.items.length);
  }

  const diff: SectionStreamEntry[] = [];

  for (const entry of next) {
    const done = counts.get(entry.key) ?? 0;
    if (entry.items.length <= done) continue;
    diff.push({ key: entry.key, items: entry.items.slice(done) });
  }

  return diff;
}
