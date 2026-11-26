import { describe, expect, it } from "vitest";
import { extractJson } from "@/lib/ai/deepseek";

describe("extractJson", () => {
  it("直接返回纯 JSON", () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });

  it("剥离代码块前的引导语", () => {
    const content = '好的，以下是结果：\n```json\n{"a":1}\n```';

    expect(JSON.parse(extractJson(content))).toEqual({ a: 1 });
  });

  it("没有 json 标注的代码块也能剥离", () => {
    const content = "```\n{\"a\":2}\n```";

    expect(JSON.parse(extractJson(content))).toEqual({ a: 2 });
  });

  it("只有半个围栏时清掉标记保留 JSON", () => {
    const content = '```json\n{"a":3}';

    expect(JSON.parse(extractJson(content))).toEqual({ a: 3 });
  });

  it("前后有解释文字时截取对象", () => {
    const content = '结果如下：{"a":4} 以上。';

    expect(JSON.parse(extractJson(content))).toEqual({ a: 4 });
  });
});
