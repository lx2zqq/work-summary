import type { SectionStreamEntry } from "@/lib/ai/stream-parser";
import type {
  MemoryPromptItem,
  QAPair,
  ReviewDraft,
  ReviewStyle,
} from "@/lib/types";

export type LoadingKind = "questions" | "final" | "date" | null;

export type SavePayload = {
  date: string;
  rawInput: string;
  draft: ReviewDraft;
  style: ReviewStyle;
  conversation: QAPair[];
  round: number;
};

export type GenerateConfig = {
  style: ReviewStyle;
  answers: QAPair[];
  round: number;
  conversationAfter: QAPair[];
  rawInput?: string;
  restyle?: boolean;
};

export type CallConfig = {
  mode: "questions" | "final" | "restyle";
  style: ReviewStyle;
  answers: QAPair[];
  round: number;
  conversationAfter: QAPair[];
  rawInput?: string;
};

export type CallResult = {
  jobId: string;
  draft: ReviewDraft;
  fallback: boolean;
  warning?: string;
  memories: MemoryPromptItem[];
};

/** 把流式推送的增量条目并到已有结果里 */
export function mergeSectionEntry(
  previous: SectionStreamEntry[],
  entry: SectionStreamEntry,
): SectionStreamEntry[] {
  const index = previous.findIndex((item) => item.key === entry.key);

  if (index < 0) return [...previous, entry];

  const next = [...previous];
  next[index] = {
    key: entry.key,
    items: [...next[index].items, ...entry.items],
  };

  return next;
}

export const QUESTION_LOADING_MESSAGES = [
  "正在检查有没有漏掉的信息…",
  "正在核对五个核心栏目…",
  "正在整理需要确认的问题…",
];
