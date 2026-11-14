import { pickDailyPhrase } from "./daily-phrase";
import { formatDateCN } from "./date";
import {
  NO_DIFFICULTY_PHRASE,
  SECTION_META,
  type AppSettings,
  type ReviewDraft,
  type SectionKey,
} from "./types";

const NUMBER_EMOJIS = [
  "1️⃣",
  "2️⃣",
  "3️⃣",
  "4️⃣",
  "5️⃣",
  "6️⃣",
  "7️⃣",
  "8️⃣",
  "9️⃣",
  "🔟",
];

export function numberPrefix(index: number): string {
  if (index >= 0 && index < NUMBER_EMOJIS.length) {
    return NUMBER_EMOJIS[index];
  }
  return `${index + 1}. `;
}

/** 清理模型可能自带的序号、栏目标题和换行 */
export function normalizeItem(item: string): string {
  let value = item.replace(/\r\n?/g, "\n").trim();
  // 点号后紧跟数字时可能是“1.5万”这类小数，不要误当列表序号删掉
  value = value.replace(
    /^\s*(?:[1-9]️⃣|🔟|\d{1,2}\s*[.、)）](?!\d))\s*/,
    "",
  );
  value = value.replace(/^🍊\s*【[^】]+】\s*/, "");
  value = value.replace(/\s*\n+\s*/g, " ");
  value = value.replace(/[ \t]{2,}/g, " ");
  return value.trim();
}

function normalizedForCompare(value: string): string {
  return value.replace(/[\s，。！？、；：""''（）()【】]/g, "");
}

function uniqueItems(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = normalizedForCompare(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

/**
 * 把结构化草稿渲染成最终可直接发钉钉的纯文本。
 * 核心 5 栏始终保留；工作困难和教研相关由设置控制。
 */
export function renderReview(
  draft: ReviewDraft,
  dateISO: string,
  settings: AppSettings,
): string {
  const lines: string[] = [
    "学管部工作复盘⬇️",
    "",
    `${formatDateCN(dateISO)}工作复盘`,
    "",
  ];

  const pushSection = (key: SectionKey, rawItems: string[]) => {
    lines.push(`🍊【${SECTION_META[key].title}】`);
    const items = uniqueItems(rawItems.map(normalizeItem).filter(Boolean));
    items.forEach((item, index) => {
      lines.push(`${numberPrefix(index)}${item}`);
    });
    lines.push("");
  };

  const sections = draft.sections ?? {};

  pushSection("xueqing", sections.xueqing ?? []);
  pushSection("jiaoxiao", sections.jiaoxiao ?? []);
  pushSection("yeji", sections.yeji ?? []);

  let dailyItems = [...(sections.richang ?? [])];
  if (settings.showFixedPhrase) {
    const phrase = pickDailyPhrase(dateISO, draft);
    const target = normalizedForCompare(phrase);
    const exists = dailyItems.some((item) =>
      normalizedForCompare(item).includes(target),
    );
    if (!exists) dailyItems = [...dailyItems, phrase];
  }
  pushSection("richang", dailyItems);

  if (settings.showKunnan) {
    const difficultyItems = sections.kunnan ?? [];
    pushSection(
      "kunnan",
      difficultyItems.length > 0 ? difficultyItems : [NO_DIFFICULTY_PHRASE],
    );
  }

  pushSection("xiaocheng", sections.xiaocheng ?? []);

  if (settings.showJiaoyan && (sections.jiaoyan ?? []).length > 0) {
    pushSection("jiaoyan", sections.jiaoyan ?? []);
  }

  return lines.join("\n").trimEnd();
}

export function countDraftItems(draft: ReviewDraft): number {
  return Object.values(draft.sections ?? {}).reduce(
    (total, items) => total + (items?.length ?? 0),
    0,
  );
}
