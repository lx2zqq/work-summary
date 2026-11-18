import { describe, expect, it } from "vitest";
import type OpenAI from "openai";
import {
  MAX_LLM_CALLS,
  isToolsUnsupportedError,
  runAgent,
} from "@/lib/ai/agent";
import type { ToolDeps } from "@/lib/ai/tools";

function makeDeps(overrides: Partial<ToolDeps> = {}): ToolDeps {
  return {
    searchStudents: async () => [],
    searchMemories: async () => [
      {
        id: "memory-1",
        scope: "student",
        studentName: "林小满",
        category: "学习习惯",
        content: "数学薄弱，家长关注作业订正",
        importance: 2,
      },
    ],
    searchReviews: async () => [],
    ...overrides,
  };
}

type FakeCompletion = {
  choices: Array<{
    message: {
      role: "assistant";
      content: string | null;
      reasoning_content?: string;
      tool_calls?: Array<{
        index: number;
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string;
  }>;
  usage: { prompt_tokens: number; completion_tokens: number };
};

function completion(input: {
  content?: string | null;
  reasoning?: string;
  toolCalls?: Array<{ name: string; args: string; id?: string }>;
}): FakeCompletion {
  const toolCalls = input.toolCalls?.map((call, index) => ({
    index,
    id: call.id ?? `call_${index}`,
    type: "function" as const,
    function: { name: call.name, arguments: call.args },
  }));

  return {
    choices: [
      {
        message: {
          role: "assistant",
          content: input.content ?? null,
          reasoning_content: input.reasoning,
          tool_calls: toolCalls,
        },
        finish_reason: toolCalls?.length ? "tool_calls" : "stop",
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 20 },
  };
}

function fakeClient(responses: Array<FakeCompletion | Error>) {
  const calls: Array<Record<string, unknown>> = [];

  const client = {
    chat: {
      completions: {
        create: async (params: Record<string, unknown>) => {
          calls.push(params);
          const next = responses.shift();
          if (!next) throw new Error("fake client 没有更多响应");
          if (next instanceof Error) throw next;
          return next;
        },
      },
    },
  };

  return { client: client as unknown as OpenAI, calls };
}

describe("runAgent", () => {
  it("不需要外部数据时一次调用直接出结果", async () => {
    const { client } = fakeClient([completion({ content: '{"sections":{}}' })]);

    const result = await runAgent({
      client,
      model: "test-model",
      messages: [{ role: "user", content: "今天的流水账" }],
      deps: makeDeps(),
    });

    expect(result.rounds).toBe(1);
    expect(result.toolCallNames).toEqual([]);
    expect(result.content).toBe('{"sections":{}}');
    expect(result.promptTokens).toBe(100);
  });

  it("工具调用后继续下一轮，并收集命中的记忆", async () => {
    const { client, calls } = fakeClient([
      completion({
        toolCalls: [
          { name: "search_memories", args: JSON.stringify({ studentName: "林小满" }) },
        ],
      }),
      completion({ content: '{"sections":{}}' }),
    ]);

    const result = await runAgent({
      client,
      model: "test-model",
      messages: [{ role: "user", content: "今天跟林小满聊了聊" }],
      deps: makeDeps(),
    });

    expect(result.rounds).toBe(2);
    expect(result.toolCallNames).toEqual(["search_memories"]);
    expect(result.memories).toHaveLength(1);
    expect(result.memories[0]?.content).toContain("数学薄弱");

    const secondMessages = calls[1]?.messages as Array<
      Record<string, unknown>
    >;
    expect(secondMessages.some((message) => message.role === "tool")).toBe(
      true,
    );
  });

  it("reasoning_content 原样回传，避免思考模式下一轮 400", async () => {
    const { client, calls } = fakeClient([
      completion({
        reasoning: "先查记忆再回答",
        toolCalls: [
          { name: "search_memories", args: JSON.stringify({ studentName: "林小满" }) },
        ],
      }),
      completion({ content: '{"sections":{}}' }),
    ]);

    await runAgent({
      client,
      model: "test-model",
      messages: [{ role: "user", content: "今天跟林小满聊了聊" }],
      deps: makeDeps(),
    });

    const secondMessages = calls[1]?.messages as Array<
      Record<string, unknown>
    >;
    const assistant = secondMessages.find(
      (message) => message.role === "assistant",
    );

    expect(assistant?.reasoning_content).toBe("先查记忆再回答");
  });

  it("达到轮次上限时强制收尾", async () => {
    const responses = Array.from({ length: MAX_LLM_CALLS - 1 }, (_, index) =>
      completion({
        toolCalls: [
          {
            name: "search_reviews",
            args: JSON.stringify({ keyword: `第${index}次` }),
          },
        ],
      }),
    );
    responses.push(completion({ content: '{"sections":{}}' }));

    const { client, calls } = fakeClient(responses);

    const result = await runAgent({
      client,
      model: "test-model",
      messages: [{ role: "user", content: "查历史" }],
      deps: makeDeps(),
    });

    expect(result.rounds).toBe(MAX_LLM_CALLS);
    expect(result.toolCallNames).toHaveLength(MAX_LLM_CALLS - 1);
    expect(calls[0]?.tool_choice).toBe("auto");
    expect(calls[MAX_LLM_CALLS - 1]?.tool_choice).toBe("none");
  });

  it("强制收尾时模型仍给空内容就报错，交给上层兜底", async () => {
    const responses = Array.from({ length: MAX_LLM_CALLS - 1 }, () =>
      completion({
        toolCalls: [
          { name: "search_reviews", args: JSON.stringify({ keyword: "x" }) },
        ],
      }),
    );
    responses.push(completion({ content: "" }));

    const { client } = fakeClient(responses);

    await expect(
      runAgent({
        client,
        model: "test-model",
        messages: [{ role: "user", content: "查历史" }],
        deps: makeDeps(),
      }),
    ).rejects.toThrow("没有生成有效内容");
  });

  it("第一轮失败原样抛出，交给上层判断是否降级", async () => {
    const failure = Object.assign(new Error("tools is not supported"), {
      status: 400,
    });
    const { client } = fakeClient([failure]);

    await expect(
      runAgent({
        client,
        model: "test-model",
        messages: [{ role: "user", content: "今天做了什么" }],
        deps: makeDeps(),
      }),
    ).rejects.toBe(failure);
  });

  it("预算耗尽时直接报超时，不再发请求", async () => {
    const { client, calls } = fakeClient([]);

    await expect(
      runAgent({
        client,
        model: "test-model",
        messages: [{ role: "user", content: "今天做了什么" }],
        deps: makeDeps(),
        budgetMs: 0,
      }),
    ).rejects.toThrow("超时");

    expect(calls).toHaveLength(0);
  });
});

describe("isToolsUnsupportedError", () => {
  it("400 且提到 tools 时判定为不支持", () => {
    expect(
      isToolsUnsupportedError(
        Object.assign(new Error("tools is not supported"), { status: 400 }),
      ),
    ).toBe(true);

    expect(
      isToolsUnsupportedError(
        Object.assign(new Error("Invalid tool_choice"), { status: 400 }),
      ),
    ).toBe(true);
  });

  it("其他 400 不误判", () => {
    expect(
      isToolsUnsupportedError(
        Object.assign(
          new Error("Prompt must contain the word 'json'"),
          { status: 400 },
        ),
      ),
    ).toBe(false);

    expect(
      isToolsUnsupportedError(
        Object.assign(
          new Error("reasoning_content in the thinking mode must be passed back"),
          { status: 400 },
        ),
      ),
    ).toBe(false);
  });

  it("非 400 错误不判定为不支持", () => {
    expect(
      isToolsUnsupportedError(
        Object.assign(new Error("tools timeout"), { status: 500 }),
      ),
    ).toBe(false);

    expect(isToolsUnsupportedError(new Error("network error"))).toBe(false);
  });
});
