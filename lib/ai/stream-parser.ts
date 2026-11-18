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

/** 当前正在写、还没闭合的那一句 */
export type PartialText = {
  key: SectionKey;
  text: string;
};

export type StreamState = {
  /** 已经闭合的完整条目 */
  sections: SectionStreamEntry[];
  /** 正在生成的半句，用于逐字展示 */
  partial: PartialText | null;
};

/** 半截字符串无法 JSON.parse，手动还原常见转义 */
function unescapePartial(raw: string): string {
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

/**
 * 从还没收完的 JSON 文本里，提取已闭合的条目和正在写的半句。
 *
 * 只认 `"sections": { "xueqing": ["...", "..."] }` 这种结构；
 * 半截的字符串只走 partial，不混进正式条目。
 * 每次调用都从头扫一遍，调用方自己对比增量。
 */
export function parseStreamState(buffer: string): StreamState {
  const empty: StreamState = { sections: [], partial: null };

  const sectionsIndex = buffer.indexOf('"sections"');
  if (sectionsIndex < 0) return empty;

  let cursor = buffer.indexOf("{", sectionsIndex);
  if (cursor < 0) return empty;
  cursor += 1;

  const sections: SectionStreamEntry[] = [];
  let partial: PartialText | null = null;

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

      if (!itemResult) {
        // 字符串还没闭合，就是当前正在写的那一句
        if (isSectionKey(key)) {
          const raw = unescapePartial(buffer.slice(cursor + 1));
          if (raw.trim()) {
            partial = { key, text: raw };
          }
        }
        break;
      }

      const value = itemResult.value.trim();
      if (value) items.push(value);
      cursor = itemResult.next;
    }

    if (isSectionKey(key) && items.length > 0) {
      sections.push({ key, items });
    }

    if (!arrayClosed) break;
  }

  return { sections, partial };
}

export function parsePartialSections(buffer: string): SectionStreamEntry[] {
  return parseStreamState(buffer).sections;
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
