import { afterEach, describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import { extractMemories } from "@/lib/ai/memory";

function completion(content: string) {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  };
}

function fakeClient(responses: string[]) {
  const create = vi.fn();

  for (const content of responses) {
    create.mockResolvedValueOnce(completion(content));
  }

  return {
    client: { chat: { completions: { create } } } as unknown as OpenAI,
    create,
  };
}

const INPUT = {
  date: "2026-11-27",
  finalText: "今天汇总了本周课时。",
  students: [],
  existing: [],
};

const VALID_RESPONSE = JSON.stringify({
  memories: [
    {
      scope: "general",
      category: "工作流程",
      content: "每周五汇总课时。",
      importance: 2,
    },
  ],
});

describe("extractMemories 重试", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("首次格式错误时自动重试并返回结果", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { client, create } = fakeClient(["不是 JSON", VALID_RESPONSE]);

    let retried = false;
    const result = await extractMemories(INPUT, {
      client,
      onUsage: (usage) => {
        retried = usage.retried;
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("每周五汇总课时。");
    expect(create).toHaveBeenCalledTimes(2);
    expect(retried).toBe(true);
  });

  it("两次都解析失败时抛 output 错误", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, create } = fakeClient(["不是 JSON", "仍然不是 JSON"]);

    await expect(extractMemories(INPUT, { client })).rejects.toMatchObject({
      name: "AiError",
      kind: "output",
    });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("客户端已中止时不发起重试", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { client, create } = fakeClient(["不是 JSON"]);
    const controller = new AbortController();
    controller.abort();

    await expect(
      extractMemories(INPUT, { client, signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(create).toHaveBeenCalledTimes(1);
  });
});
