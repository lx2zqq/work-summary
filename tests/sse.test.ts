import { describe, expect, it } from "vitest";
import { SSEDecoder, encodeSSE } from "@/lib/sse";

describe("encodeSSE", () => {
  it("按 SSE 格式输出", () => {
    expect(encodeSSE("section", { key: "xueqing" })).toBe(
      'event: section\ndata: {"key":"xueqing"}\n\n',
    );
  });
});

describe("SSEDecoder", () => {
  it("解析单个完整事件", () => {
    const decoder = new SSEDecoder();
    const events = decoder.push(encodeSSE("done", { ok: true }));

    expect(events).toEqual([{ event: "done", data: { ok: true } }]);
  });

  it("事件跨 chunk 时等待拼完整", () => {
    const decoder = new SSEDecoder();

    expect(decoder.push("event: sec")).toEqual([]);
    expect(decoder.push('tion\ndata: {"n":1}\n\n')).toEqual([
      { event: "section", data: { n: 1 } },
    ]);
  });

  it("一次返回多个事件", () => {
    const decoder = new SSEDecoder();
    const events = decoder.push(
      `${encodeSSE("a", { i: 1 })}${encodeSSE("b", { i: 2 })}`,
    );

    expect(events).toEqual([
      { event: "a", data: { i: 1 } },
      { event: "b", data: { i: 2 } },
    ]);
  });

  it("忽略无法解析的事件", () => {
    const decoder = new SSEDecoder();

    expect(decoder.push("data: 不是 JSON\n\n")).toEqual([]);
  });

  it("兼容 CRLF 换行", () => {
    const decoder = new SSEDecoder();
    const events = decoder.push('event: x\r\ndata: {"a":1}\r\n\r\n');

    expect(events).toEqual([{ event: "x", data: { a: 1 } }]);
  });
});
