import { afterEach, describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import {
  generateWeeklyReport,
  parseWeeklyReportResponse,
  type WeeklyGenerationInput,
} from "@/lib/ai/weekly";
import { emptyDraft } from "@/lib/types";

function completion(content: string) {
  return {
    choices: [{ message: { content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
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

const ACTIVE = "高一：1人\n合计：1人";

const INPUT: WeeklyGenerationInput = {
  weekStart: "2026-11-23",
  weekEnd: "2026-11-29",
  sourceStartDate: "2026-11-23",
  sourceEndDate: "2026-11-29",
  reviews: [
    {
      reviewDate: "2026-11-24",
      finalText: "林小满妈妈微信沟通，家长确认周六续费。",
      draft: emptyDraft(),
      rawInput: "林小满续费",
    },
  ],
  memories: [
    {
      id: "memory-1",
      scope: "student",
      studentName: "林小满",
      category: "报名续费",
      content: "家长关注数学续费。",
      importance: 2,
    },
  ],
  activeStudentsByGrade: ACTIVE,
};

const VALID_RESPONSE = JSON.stringify({
  summary: {
    miantan: "林小满：沟通续费，家长确认周六到店。",
    weixin: "林小满妈妈：微信确认续费。",
  },
  metrics: {
    qingjia: "无",
    yujing: "无",
    tingke: "无",
    jieke: "无",
    kuoke: "无",
    xinqian: "林小满",
    xufei: "林小满",
    // 模型算错人数，解析时必须被程序统计结果覆盖
    activeStudentsByGrade: "高一：99人",
  },
  reflection: "1. 续费沟通要先确认家长到店时间。\n2. 微信跟进要留记录。",
  nextWeek: {
    zhongdianHuifang: "林小满：确认续费到店。",
    jiazhanghui: "无",
  },
  supportNeeded: "暂无",
});

describe("parseWeeklyReportResponse", () => {
  it("兼容 Markdown 围栏并强制使用程序统计的年级人数", () => {
    const parsed = parseWeeklyReportResponse(
      `\`\`\`json\n${VALID_RESPONSE}\n\`\`\``,
      ACTIVE,
    );

    expect(parsed.error).toBe("");
    expect(parsed.content?.summary.miantan).toContain("林小满");
    expect(parsed.content?.metrics.xufei).toBe("林小满");
    expect(parsed.content?.metrics.activeStudentsByGrade).toBe(ACTIVE);
  });

  it("缺字段时补默认值：名单填无，心得和支持填暂无", () => {
    const parsed = parseWeeklyReportResponse(
      JSON.stringify({ summary: { miantan: "与两位家长面谈" } }),
      ACTIVE,
    );

    expect(parsed.content?.summary.miantan).toBe("与两位家长面谈");
    expect(parsed.content?.summary.weixin).toBe("无");
    expect(parsed.content?.metrics.qingjia).toBe("无");
    expect(parsed.content?.reflection).toBe("暂无");
    expect(parsed.content?.nextWeek.zhongdianHuifang).toBe("无");
    expect(parsed.content?.nextWeek.jiazhanghui).toBe("无");
    expect(parsed.content?.supportNeeded).toBe("暂无");
    expect(parsed.content?.metrics.activeStudentsByGrade).toBe(ACTIVE);
  });

  it("兼容被 report 包裹的输出", () => {
    const parsed = parseWeeklyReportResponse(
      JSON.stringify({ report: { summary: { weixin: "微信沟通家长" } } }),
      ACTIVE,
    );

    expect(parsed.content?.summary.weixin).toBe("微信沟通家长");
  });

  it("兼容模型返回中文 key", () => {
    const parsed = parseWeeklyReportResponse(
      JSON.stringify({
        本周工作总结: { 面谈: "与家长面谈", 微信: "微信沟通" },
        本周数据汇总: { 请假: "1 人", 续费: "林小满" },
        本周工作心得: "续费沟通先确认到店时间。",
        下周工作安排: { 重点回访: "林小满", 家长会: "无" },
        需要的支持: "暂无",
      }),
      ACTIVE,
    );

    expect(parsed.error).toBe("");
    expect(parsed.content?.summary.miantan).toBe("与家长面谈");
    expect(parsed.content?.summary.weixin).toBe("微信沟通");
    expect(parsed.content?.metrics.qingjia).toBe("1 人");
    expect(parsed.content?.metrics.xufei).toBe("林小满");
    expect(parsed.content?.reflection).toBe(
      "续费沟通先确认到店时间。",
    );
    expect(parsed.content?.nextWeek.zhongdianHuifang).toBe("林小满");
    expect(parsed.content?.supportNeeded).toBe("暂无");
  });

  it("兼容 weekly_report 等更深层包装", () => {
    const parsed = parseWeeklyReportResponse(
      JSON.stringify({
        data: {
          weekly_report: {
            summary: { miantan: "深层包装里的面谈" },
          },
        },
      }),
      ACTIVE,
    );

    expect(parsed.content?.summary.miantan).toBe("深层包装里的面谈");
  });

  it("兼容顶层数组", () => {
    const parsed = parseWeeklyReportResponse(
      JSON.stringify([{ summary: { weixin: "数组里的微信沟通" } }]),
      ACTIVE,
    );

    expect(parsed.content?.summary.weixin).toBe("数组里的微信沟通");
  });

  it("兼容把周报 JSON 再序列化进字符串", () => {
    const inner = JSON.stringify({
      summary: { miantan: "字符串里的面谈" },
    });

    const parsed = parseWeeklyReportResponse(
      JSON.stringify({ data: inner }),
      ACTIVE,
    );

    expect(parsed.content?.summary.miantan).toBe("字符串里的面谈");
  });

  it("名单字段返回数组时合并成文本", () => {
    const parsed = parseWeeklyReportResponse(
      JSON.stringify({
        metrics: { yujing: ["林小满", "陈一鸣"] },
      }),
      ACTIVE,
    );

    expect(parsed.content?.metrics.yujing).toBe("林小满、陈一鸣");
  });

  it("数量返回数字时转成字符串", () => {
    const parsed = parseWeeklyReportResponse(
      JSON.stringify({ metrics: { qingjia: 2 } }),
      ACTIVE,
    );

    expect(parsed.content?.metrics.qingjia).toBe("2");
  });

  it("畸形 JSON 返回错误而不是空内容", () => {
    const parsed = parseWeeklyReportResponse("不是 JSON", ACTIVE);

    expect(parsed.content).toBeNull();
    expect(parsed.error).toBe("输出不是合法 JSON");
  });

  it("完全无关的对象不被当成有效周报", () => {
    const parsed = parseWeeklyReportResponse(
      JSON.stringify({ foo: "bar" }),
      ACTIVE,
    );

    expect(parsed.content).toBeNull();
    expect(parsed.error).toContain("没有周报字段");
  });
});

describe("generateWeeklyReport 重试", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("首次格式错误时自动重试并返回结果", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { client, create } = fakeClient(["不是 JSON", VALID_RESPONSE]);

    let retried = false;
    const content = await generateWeeklyReport(INPUT, {
      client,
      onUsage: (usage) => {
        retried = usage.retried;
      },
    });

    expect(content.metrics.activeStudentsByGrade).toBe(ACTIVE);
    expect(content.summary.weixin).toContain("微信");
    expect(create).toHaveBeenCalledTimes(2);
    expect(retried).toBe(true);
  });

  it("请求里带上程序统计的年级人数", async () => {
    const { client, create } = fakeClient([VALID_RESPONSE]);

    await generateWeeklyReport(INPUT, { client });

    const request = JSON.stringify(create.mock.calls[0][0]);
    expect(request).toContain("高一：1人");
    expect(request).toContain("林小满妈妈微信沟通");
  });

  it("两次都解析失败时抛 output 错误", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, create } = fakeClient(["不是 JSON", "仍然不是 JSON"]);

    await expect(
      generateWeeklyReport(INPUT, { client }),
    ).rejects.toMatchObject({
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
      generateWeeklyReport(INPUT, {
        client,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(create).toHaveBeenCalledTimes(1);
  });
});
