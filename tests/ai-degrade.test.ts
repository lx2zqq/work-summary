import { describe, expect, it } from "vitest";
import type OpenAI from "openai";
import { generateDraftWithUsage } from "@/lib/ai/deepseek";
import type { PromptContext } from "@/lib/ai/prompt";
import type { ToolDeps } from "@/lib/ai/tools";
import {
  DEFAULT_SETTINGS,
  MAX_FOLLOW_UP_ROUNDS,
} from "@/lib/types";

const CONTEXT: PromptContext = {
  mode: "final",
  reviewDate: "2026-11-18",
  style: "concise",
  settings: DEFAULT_SETTINGS,
  students: [
    {
      id: "student-1",
      name: "林小满",
      grade: "高一",
      subjects: "数学",
      status: "在读",
      note: null,
    },
  ],
  recentReviews: [{ date: "2026-11-17", text: "昨天的复盘正文" }],
  memories: [
    {
      id: "memory-1",
      scope: "student",
      studentName: "林小满",
      category: "家长沟通",
      content: "林小满妈妈偏好微信沟通。",
      importance: 2,
    },
  ],
  rawInput: "今天跟林小满聊了聊作业。",
  answers: [],
  round: MAX_FOLLOW_UP_ROUNDS,
  toolsEnabled: true,
};

const DEPS: ToolDeps = {
  searchStudents: async () => [],
  searchMemories: async () => [],
  searchReviews: async () => [],
};

const VALID_OUTPUT = JSON.stringify({
  sections: {
    xueqing: ["林小满：完成今日作业。"],
    richang: ["今天主要跟进了林小满的作业，后续继续关注订正质量。"],
  },
  notes: [],
});

type FakeParams = {
  messages: Array<{ role: string; content: string }>;
  tools?: unknown;
  tool_choice?: string;
};

function fakeClient(handler: (params: FakeParams, call: number) => unknown) {
  const calls: FakeParams[] = [];

  const client = {
    chat: {
      completions: {
        create: async (params: FakeParams) => {
          calls.push(params);
          return handler(params, calls.length);
        },
      },
    },
  };

  return { client: client as unknown as OpenAI, calls };
}

function completion(content: string) {
  return {
    choices: [
      { message: { role: "assistant", content }, finish_reason: "stop" },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 20 },
  };
}

describe("工具不支持时自动降级", () => {
  it("400 提到 tools 时退回预注入，并重建不含工具的 prompt", async () => {
    const warning = console.warn;
    console.warn = () => {};

    const { client, calls } = fakeClient((params, call) => {
      if (call === 1) {
        expect(params.tools).toBeDefined();
        throw Object.assign(new Error("tools is not supported"), {
          status: 400,
        });
      }
      return completion(VALID_OUTPUT);
    });

    const result = await generateDraftWithUsage(CONTEXT, {
      client,
      toolDeps: DEPS,
    });

    expect(result.degraded).toBe(true);
    expect(result.toolCallNames).toEqual([]);
    expect(result.draft.sections.richang).toHaveLength(1);

    // 降级请求不再带工具，并且把原来的背景数据补回 prompt
    expect(calls[1]?.tools).toBeUndefined();
    const prompt = calls[1]?.messages
      .map((message) => message.content)
      .join("\n");
    expect(prompt).toContain("【学生名单】");
    expect(prompt).toContain("林小满妈妈偏好微信沟通");

    console.warn = warning;
  });

  it("其他 400 不降级，直接抛错", async () => {
    const { client, calls } = fakeClient(() => {
      throw Object.assign(
        new Error("Prompt must contain the word 'json'"),
        { status: 400 },
      );
    });

    await expect(
      generateDraftWithUsage(CONTEXT, { client, toolDeps: DEPS }),
    ).rejects.toThrow();

    expect(calls).toHaveLength(1);
  });

  it("关闭工具时直接单次调用，不发送 tools 参数", async () => {
    const { client, calls } = fakeClient(() => completion(VALID_OUTPUT));

    const result = await generateDraftWithUsage(
      { ...CONTEXT, toolsEnabled: false },
      { client, toolDeps: DEPS },
    );

    expect(result.degraded).toBe(false);
    expect(result.toolRounds).toBe(1);
    expect(calls[0]?.tools).toBeUndefined();
    expect(
      calls[0]?.messages.map((message) => message.content).join("\n"),
    ).toContain("【学生名单】");
  });
});
