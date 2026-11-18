import { describe, expect, it } from "vitest";
import {
  diffSections,
  parsePartialSections,
} from "@/lib/ai/stream-parser";

describe("parsePartialSections", () => {
  it("字符串没闭合时不返回任何条目", () => {
    expect(
      parsePartialSections('{"sections":{"xueqing":["林小满：完成作业。'),
    ).toEqual([]);
  });

  it("数组闭合后返回完整条目", () => {
    expect(
      parsePartialSections('{"sections":{"xueqing":["林小满：完成作业。"]'),
    ).toEqual([{ key: "xueqing", items: ["林小满：完成作业。"] }]);
  });

  it("只返回已闭合的条目，半截的跳过", () => {
    const text =
      '{"sections":{"xueqing":["林小满：完成作业。","陈一鸣：请假';

    expect(parsePartialSections(text)).toEqual([
      { key: "xueqing", items: ["林小满：完成作业。"] },
    ]);
  });

  it("多个栏目按出现顺序返回", () => {
    const text = JSON.stringify({
      sections: {
        xueqing: ["林小满：完成作业。"],
        jiaoxiao: ["林小满妈妈（微信）：沟通排课。"],
      },
    });

    expect(parsePartialSections(text)).toEqual([
      { key: "xueqing", items: ["林小满：完成作业。"] },
      { key: "jiaoxiao", items: ["林小满妈妈（微信）：沟通排课。"] },
    ]);
  });

  it("忽略 sections 之外的字段", () => {
    const text = '{"notes":["提示"],"sections":{"xueqing":["条目"]}}';

    expect(parsePartialSections(text)).toEqual([
      { key: "xueqing", items: ["条目"] },
    ]);
  });

  it("空数组不返回", () => {
    expect(
      parsePartialSections('{"sections":{"yeji":[]}}'),
    ).toEqual([]);
  });

  it("正确处理转义引号和反斜杠", () => {
    const text = '{"sections":{"xueqing":["他说\\"好\\"了"]}}';

    expect(parsePartialSections(text)).toEqual([
      { key: "xueqing", items: ['他说"好"了'] },
    ]);
  });

  it("遇到未知栏目名时跳过", () => {
    const text = '{"sections":{"unknown":["a"],"xueqing":["b"]}}';

    expect(parsePartialSections(text)).toEqual([
      { key: "xueqing", items: ["b"] },
    ]);
  });
});

describe("diffSections", () => {
  it("只返回新增的条目", () => {
    expect(
      diffSections(
        [{ key: "xueqing", items: ["a"] }],
        [{ key: "xueqing", items: ["a", "b"] }],
      ),
    ).toEqual([{ key: "xueqing", items: ["b"] }]);
  });

  it("没有新增时返回空数组", () => {
    expect(
      diffSections(
        [{ key: "xueqing", items: ["a"] }],
        [{ key: "xueqing", items: ["a"] }],
      ),
    ).toEqual([]);
  });

  it("新出现的栏目整段返回", () => {
    expect(
      diffSections(
        [{ key: "xueqing", items: ["a"] }],
        [
          { key: "xueqing", items: ["a"] },
          { key: "jiaoxiao", items: ["b"] },
        ],
      ),
    ).toEqual([{ key: "jiaoxiao", items: ["b"] }]);
  });
});
