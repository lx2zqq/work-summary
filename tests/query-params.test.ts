import { describe, expect, it } from "vitest";
import { parsePositiveInt } from "@/lib/query-params";

describe("parsePositiveInt", () => {
  it("缺省时返回 fallback", () => {
    expect(parsePositiveInt(null, { fallback: 50, max: 100 })).toBe(50);
  });

  it("接受正整数", () => {
    expect(parsePositiveInt("12", { fallback: 50, max: 100 })).toBe(12);
    expect(parsePositiveInt("1", { fallback: 50, max: 100 })).toBe(1);
  });

  it("超过上限按上限处理", () => {
    expect(parsePositiveInt("500", { fallback: 50, max: 100 })).toBe(100);
  });

  it("空串、0、负数、小数、非数字都返回 null", () => {
    for (const value of ["", "0", "-1", "1.5", "abc", " 5", "1e3"]) {
      expect(parsePositiveInt(value, { fallback: 50, max: 100 })).toBeNull();
    }
  });

  it("超出安全整数范围返回 null", () => {
    expect(
      parsePositiveInt("999999999999999999999", {
        fallback: 50,
        max: 100,
      }),
    ).toBeNull();
  });
});
