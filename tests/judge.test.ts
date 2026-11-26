import { describe, expect, it } from "vitest";
import type OpenAI from "openai";
import { judgeDraft } from "@/lib/eval/judge";
import { emptyDraft } from "@/lib/types";

const VALID_SCORE = JSON.stringify({
  factuality: 2,
  completeness: 2,
  usability: 1,
  reason: "可直接发送",
});

const INPUT = {
  rawInput: "今天林小满作业完成。",
  draft: emptyDraft(),
};

function fakeClient(responses: string[]) {
  const calls: unknown[] = [];

  const client = {
    chat: {
      completions: {
        create: async (params: unknown) => {
          calls.push(params);
          return {
            choices: [
              {
                message: {
                  role: "assistant",
                  content: responses.shift() ?? "",
                },
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          };
        },
      },
    },
  } as unknown as OpenAI;

  return { client, calls };
}

describe("judgeDraft", () => {
  it("首次输出无效时重试一次", async () => {
    const { client, calls } = fakeClient(["", VALID_SCORE]);

    const score = await judgeDraft(INPUT, { client });

    expect(score).toEqual({
      factuality: 2,
      completeness: 2,
      usability: 1,
      reason: "可直接发送",
    });
    expect(calls).toHaveLength(2);
  });

  it("两次输出都无效时报错", async () => {
    const error = console.error;
    console.error = () => {};

    try {
      const { client, calls } = fakeClient(["不是 JSON", ""]);

      await expect(judgeDraft(INPUT, { client })).rejects.toThrow(
        "judge 输出不是合法 JSON",
      );
      expect(calls).toHaveLength(2);
    } finally {
      console.error = error;
    }
  });

  it("judge 规则明确 richang 的合理优化不算幻觉", async () => {
    const { client, calls } = fakeClient([VALID_SCORE]);

    await judgeDraft(INPUT, { client });

    const params = calls[0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const system =
      params.messages.find((message) => message.role === "system")?.content ??
      "";

    expect(system).toContain("richang 评判口径");
    expect(system).toContain("不应判为幻觉");
  });
});
