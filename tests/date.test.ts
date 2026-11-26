import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  formatDateCN,
  formatDateShort,
  isValidISODate,
  weekdayCN,
} from "@/lib/date";

describe("isValidISODate", () => {
  it("接受真实存在的日期", () => {
    expect(isValidISODate("2026-11-26")).toBe(true);
    expect(isValidISODate("2024-02-29")).toBe(true);
  });

  it("拒绝不存在的日历日期", () => {
    expect(isValidISODate("2026-02-30")).toBe(false);
    expect(isValidISODate("2026-02-29")).toBe(false);
    expect(isValidISODate("2026-13-01")).toBe(false);
    expect(isValidISODate("2026-00-10")).toBe(false);
    expect(isValidISODate("2026-04-31")).toBe(false);
    expect(isValidISODate("2026-01-00")).toBe(false);
  });

  it("拒绝格式不正确的输入", () => {
    expect(isValidISODate("2026-1-01")).toBe(false);
    expect(isValidISODate("26-01-01")).toBe(false);
    expect(isValidISODate("2026/01/01")).toBe(false);
    expect(isValidISODate("")).toBe(false);
    expect(isValidISODate("2026-01-01T00:00:00Z")).toBe(false);
  });
});

describe("日期函数对非法输入安全降级", () => {
  it("不抛 RangeError", () => {
    expect(() => formatDateCN("not-a-date")).not.toThrow();
    expect(() => formatDateShort("2026-02-30")).not.toThrow();
    expect(() => weekdayCN("bad")).not.toThrow();
    expect(() => addDaysISO("bad", 1)).not.toThrow();
  });

  it("非法输入返回原值或空串", () => {
    expect(formatDateCN("not-a-date")).toBe("not-a-date");
    expect(formatDateShort("2026-02-30")).toBe("2026-02-30");
    expect(weekdayCN("bad")).toBe("");
    expect(addDaysISO("bad", 1)).toBe("bad");
  });

  it("合法输入正常格式化与加减", () => {
    expect(formatDateCN("2026-11-26")).toBe("2026年11月26日");
    expect(formatDateShort("2026-11-26")).toBe("11月26日");
    expect(weekdayCN("2026-11-26")).toBe("周四");
    expect(addDaysISO("2026-11-26", 1)).toBe("2026-11-27");
    expect(addDaysISO("2026-11-26", -1)).toBe("2026-11-25");
    expect(addDaysISO("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
  });
});
