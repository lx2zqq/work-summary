import type OpenAI from "openai";
import { z } from "zod";
import {
  AiError,
  createClient,
  extractJson,
  getAiModelName,
} from "@/lib/ai/deepseek";
import type { ReviewDraft } from "@/lib/types";

const judgeSchema = z.object({
  factuality: z.number().int().min(0).max(2),
  completeness: z.number().int().min(0).max(2),
  usability: z.number().int().min(0).max(2),
  reason: z.string().max(300),
});

export type JudgeScore = z.infer<typeof judgeSchema>;

const JUDGE_RULES = `你是复盘质量评审。只根据用户提供的流水账和复盘正文打分，不要使用外部知识。

【评分维度，每项 0-2 分】
- factuality 事实一致性：
  2 = 所有事实都能在流水账或问答里找到；
  1 = 有轻微推断，但没有编造关键事实；
  0 = 编造了学生、金额、沟通渠道或结果。
- completeness 完整性：
  2 = 核心信息都已归类，空栏目没有被硬凑；
  1 = 漏掉少量信息；
  0 = 漏掉大部分信息或栏目错乱。
- usability 可发送性：
  2 = 可以直接复制到钉钉，措辞规范；
  1 = 需要少量修改；
  0 = 需要重写。

【richang 评判口径】
richang 的职责是基于当天真实工作提出温和、可落地的下次优化做法。只要建议没有编造当天未发生的客观事实（如未提及的学生、金额、沟通渠道或结果），就属于合理优化，不应判为幻觉或过度推断，factuality 仍可给 2 分。

【输出 JSON】
{"factuality":0-2,"completeness":0-2,"usability":0-2,"reason":"不超过 80 字"}
不要输出 JSON 以外的内容。`;

/** 思考模式会占用正文 token，最多重试一次，避免 judge 结果偶发为空 */
const JUDGE_MAX_ATTEMPTS = 2;
const JUDGE_MAX_TOKENS = 1200;

function parseJudgeScore(content: string): JudgeScore | null {
  if (!content) return null;

  try {
    const parsed = judgeSchema.safeParse(
      JSON.parse(extractJson(content)),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function judgeDraft(
  input: {
    rawInput: string;
    draft: ReviewDraft;
  },
  options: { client?: OpenAI } = {},
): Promise<JudgeScore> {
  const client = options.client ?? createClient();
  const model = getAiModelName();
  let lastContent = "";

  for (let attempt = 0; attempt < JUDGE_MAX_ATTEMPTS; attempt += 1) {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      // 降低思考强度，避免推理内容把 JSON 正文挤掉
      reasoning_effort: "low",
      max_tokens: JUDGE_MAX_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: JUDGE_RULES },
        {
          role: "user",
          content: [
            `【流水账】\n${input.rawInput}`,
            `【复盘正文】\n${JSON.stringify(input.draft.sections, null, 2)}`,
            attempt === 0
              ? "请只输出 JSON。"
              : "上一次输出不是合法 JSON。请直接输出符合约定的 JSON，不要解释。",
          ].join("\n\n"),
        },
      ],
    });

    lastContent = completion.choices[0]?.message?.content?.trim() ?? "";
    const score = parseJudgeScore(lastContent);

    if (score) return score;
  }

  console.error("[judge] 原始输出：", lastContent.slice(0, 500));
  throw new AiError("judge 输出不是合法 JSON", "output");
}
