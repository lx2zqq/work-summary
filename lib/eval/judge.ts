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

【输出 JSON】
{"factuality":0-2,"completeness":0-2,"usability":0-2,"reason":"不超过 80 字"}
不要输出 JSON 以外的内容。`;

export async function judgeDraft(input: {
  rawInput: string;
  draft: ReviewDraft;
}): Promise<JudgeScore> {
  const client = createClient();
  const model = getAiModelName();

  const completion = await client.chat.completions.create({
    model,
    temperature: 0,
    max_tokens: 500,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: JUDGE_RULES },
      {
        role: "user",
        content: [
          `【流水账】\n${input.rawInput}`,
          `【复盘正文】\n${JSON.stringify(input.draft.sections, null, 2)}`,
          "请只输出 JSON。",
        ].join("\n\n"),
      },
    ],
  });

  const content = completion.choices[0]?.message?.content?.trim() ?? "";

  try {
    const parsed = judgeSchema.safeParse(
      JSON.parse(extractJson(content)),
    );

    if (!parsed.success) {
      throw new AiError("judge 输出字段不符合要求", "output");
    }

    return parsed.data;
  } catch (error) {
    if (error instanceof AiError) throw error;
    console.error("[judge] 原始输出：", content.slice(0, 500));
    throw new AiError("judge 输出不是合法 JSON", "output");
  }
}
