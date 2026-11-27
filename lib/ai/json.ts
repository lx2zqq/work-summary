/** 去掉 Markdown 代码块，兼容只有半个围栏的情况 */
export function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  return text.replace(/```(?:json)?/gi, "").trim();
}

/**
 * 从可能带解释文字的文本里截取最外层 JSON。
 * 用括号配对而不是 lastIndexOf，避免 content 里的 ] 或 } 把结尾截错。
 */
export function sliceOutermostJson(text: string): string {
  const objectStart = text.indexOf("{");
  const arrayStart = text.indexOf("[");
  const candidates = [objectStart, arrayStart].filter((index) => index >= 0);

  if (candidates.length === 0) return text.trim();

  const start = Math.min(...candidates);
  const opener = text[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === opener) {
      depth += 1;
    } else if (char === closer) {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  // 括号不完整时退回宽松截取，交给 JSON.parse 做最后判断
  const end = text.lastIndexOf(closer);
  return end > start ? text.slice(start, end + 1) : text.trim();
}

export type JsonParseResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

/** 先按原文解析，失败后再截取最外层 JSON，兼容代码围栏和前后解释 */
export function parseJsonValue(raw: string): JsonParseResult {
  const text = stripCodeFence(raw.trim());
  if (!text) return { ok: false, error: "输出为空" };

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    // 前后可能带解释文字，继续尝试截取最外层 JSON
  }

  const sliced = sliceOutermostJson(text);
  if (sliced === text) return { ok: false, error: "输出不是合法 JSON" };

  try {
    return { ok: true, value: JSON.parse(sliced) };
  } catch {
    return { ok: false, error: "输出不是合法 JSON" };
  }
}
