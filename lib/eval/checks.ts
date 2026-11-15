import {
  MAX_QUESTIONS_PER_ROUND,
  SECTION_ORDER,
  type QAPair,
  type ReviewDraft,
  type ReviewStyle,
  type SectionKey,
} from "@/lib/types";

export type EvalExpect = {
  /** 必须在最终正文里出现的事实（学生名、数字、关键词） */
  mustInclude?: string[];
  /** 不允许出现在正文或问题里的内容（名单外学生、旧状态） */
  mustNotInclude?: string[];
  /** 不允许出现在正文里的学生名 */
  forbidStudents?: string[];
  sections?: Partial<
    Record<SectionKey, { minItems?: number; maxItems?: number }>
  >;
  minQuestions?: number;
  maxQuestions?: number;
  /** 至少有一个问题提到这些关键词（用于记忆追问） */
  requireQuestionMentions?: string[];
  questionMustHaveOptions?: boolean;
  noPlaceholders?: boolean;
  /** 改文风前后条目数必须一致 */
  sameItemCount?: boolean;
  /** 详细版字数必须大于改前 */
  detailedMustBeLonger?: boolean;
  /** 输入几乎没有信息量时，空正文是正确行为 */
  allowEmpty?: boolean;
};

export type CheckInput = {
  mode: "questions" | "final" | "restyle";
  style: ReviewStyle;
  draft: ReviewDraft;
  expect: EvalExpect;
  rawInput: string;
  answers: QAPair[];
  beforeDraft?: ReviewDraft;
};

export type CheckResult = {
  name: string;
  passed: boolean;
  detail: string;
};

const PLACEHOLDERS = ["待确认", "待补充", "未提供", "不明确"];

export function countItems(draft: ReviewDraft): number {
  return Object.values(draft.sections).reduce(
    (total, items) => total + items.length,
    0,
  );
}

export function countChars(draft: ReviewDraft): number {
  return Object.values(draft.sections)
    .flat()
    .reduce((total, item) => total + item.length, 0);
}

export function draftText(draft: ReviewDraft): string {
  return [
    ...Object.values(draft.sections).flat(),
    draft.dailyPhrase ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

function questionText(draft: ReviewDraft): string {
  return draft.questions.map((question) => question.text).join("\n");
}

function result(
  name: string,
  issues: string[],
): CheckResult {
  return {
    name,
    passed: issues.length === 0,
    detail: issues.join("；"),
  };
}

export function runChecks(input: CheckInput): CheckResult[] {
  const { draft, expect, mode } = input;
  const text = draftText(draft);
  const allText = [text, questionText(draft)].filter(Boolean).join("\n");
  const results: CheckResult[] = [];

  // 1. 结构
  const structureIssues: string[] = [];
  for (const key of SECTION_ORDER) {
    if (!Array.isArray(draft.sections[key])) {
      structureIssues.push(`${key} 不是数组`);
      continue;
    }

    if (draft.sections[key].some((item) => !item.trim())) {
      structureIssues.push(`${key} 有空条目`);
    }
  }

  if (draft.questions.length > MAX_QUESTIONS_PER_ROUND) {
    structureIssues.push(
      `问题数 ${draft.questions.length} 超过 ${MAX_QUESTIONS_PER_ROUND}`,
    );
  }

  if (draft.notes.length > 3) {
    structureIssues.push(`notes 超过 3 条`);
  }

  results.push(result("结构", structureIssues));

  // 日常工作复盘固定 1 条且不少于 20 字；空输入保护用例除外
  if (mode === "final" && !expect.allowEmpty) {
    const richang = draft.sections.richang ?? [];
    const issues: string[] = [];

    if (richang.length !== 1) {
      issues.push(`需要 1 条，实际 ${richang.length} 条`);
    }
    for (const item of richang) {
      if (item.trim().length < 20) {
        issues.push(`“${item.slice(0, 12)}…”少于 20 字`);
      }
    }

    results.push(result("日常工作复盘", issues));
  }

  // 2. 必含事实
  if (mode !== "questions" && expect.mustInclude?.length) {
    const missing = expect.mustInclude.filter(
      (value) => !text.includes(value),
    );
    results.push(
      result(
        "必含事实",
        missing.map((value) => `缺少“${value}”`),
      ),
    );
  }

  // 3. 禁止内容
  if (expect.mustNotInclude?.length) {
    const found = expect.mustNotInclude.filter((value) =>
      allText.includes(value),
    );
    results.push(
      result(
        "禁止内容",
        found.map((value) => `出现了“${value}”`),
      ),
    );
  }

  if (expect.forbidStudents?.length) {
    const found = expect.forbidStudents.filter((value) =>
      text.includes(value),
    );
    results.push(
      result(
        "名单外学生",
        found.map((value) => `正文出现了“${value}”`),
      ),
    );
  }

  // 4. 栏目覆盖
  if (expect.sections) {
    const issues: string[] = [];
    for (const [key, range] of Object.entries(expect.sections)) {
      const sectionKey = key as SectionKey;
      const count = draft.sections[sectionKey]?.length ?? 0;

      if (range.minItems !== undefined && count < range.minItems) {
        issues.push(
          `${sectionKey} 需要至少 ${range.minItems} 条，实际 ${count}`,
        );
      }
      if (range.maxItems !== undefined && count > range.maxItems) {
        issues.push(
          `${sectionKey} 最多 ${range.maxItems} 条，实际 ${count}`,
        );
      }
    }
    results.push(result("栏目覆盖", issues));
  }

  // 5. 追问质量
  if (mode === "questions") {
    const issues: string[] = [];

    if (
      expect.minQuestions !== undefined &&
      draft.questions.length < expect.minQuestions
    ) {
      issues.push(
        `问题数 ${draft.questions.length} 少于 ${expect.minQuestions}`,
      );
    }
    if (
      expect.maxQuestions !== undefined &&
      draft.questions.length > expect.maxQuestions
    ) {
      issues.push(
        `问题数 ${draft.questions.length} 多于 ${expect.maxQuestions}`,
      );
    }

    if (expect.questionMustHaveOptions) {
      for (const question of draft.questions) {
        if (question.options.length < 2) {
          issues.push(`问题“${question.text}”选项少于 2 个`);
        }
      }
    }

    if (expect.requireQuestionMentions?.length) {
      const questions = questionText(draft);
      const missing = expect.requireQuestionMentions.filter(
        (value) => !questions.includes(value),
      );
      issues.push(
        ...missing.map((value) => `没有追问提到“${value}”`),
      );
    }

    results.push(result("追问质量", issues));
  }

  // 6. 占位词
  if (expect.noPlaceholders !== false) {
    const found = PLACEHOLDERS.filter((value) => allText.includes(value));
    results.push(
      result(
        "占位词",
        found.map((value) => `出现了“${value}”`),
      ),
    );
  }

  // 7. 改文风约束
  if (mode === "restyle" && input.beforeDraft) {
    if (expect.sameItemCount) {
      const before = countItems(input.beforeDraft);
      const after = countItems(draft);
      results.push(
        result(
          "条目数不变",
          before === after ? [] : [`改前 ${before} 条，改后 ${after} 条`],
        ),
      );
    }

    if (expect.detailedMustBeLonger) {
      const before = countChars(input.beforeDraft);
      const after = countChars(draft);
      results.push(
        result(
          "详细版更长",
          after > before ? [] : [`改前 ${before} 字，改后 ${after} 字`],
        ),
      );
    }

  }

  return results;
}
