import { describe, expect, it } from "vitest";
import {
  getDefaultWeeklyReportRange,
  getWeekRange,
  shiftWeek,
} from "@/lib/date";
import {
  createEmptyWeeklyReportContent,
  formatWeeklyReportPlainText,
  summarizeActiveStudentsByGrade,
} from "@/lib/weekly-report";
import type { Student } from "@/lib/types";

type StudentGrade = Pick<Student, "status" | "grade">;

describe("getWeekRange", () => {
  it("周一、周中、周日都返回同一周的周一到周日", () => {
    expect(getWeekRange("2026-11-23")).toEqual({
      weekStart: "2026-11-23",
      weekEnd: "2026-11-29",
    });
    expect(getWeekRange("2026-11-26")).toEqual({
      weekStart: "2026-11-23",
      weekEnd: "2026-11-29",
    });
    expect(getWeekRange("2026-11-29")).toEqual({
      weekStart: "2026-11-23",
      weekEnd: "2026-11-29",
    });
  });

  it("跨月时周次仍然连续", () => {
    expect(getWeekRange("2026-12-01")).toEqual({
      weekStart: "2026-11-30",
      weekEnd: "2026-12-06",
    });
  });

  it("跨年时周次仍然连续", () => {
    expect(getWeekRange("2026-12-31")).toEqual({
      weekStart: "2026-12-28",
      weekEnd: "2027-01-03",
    });
    expect(getWeekRange("2027-01-01")).toEqual({
      weekStart: "2026-12-28",
      weekEnd: "2027-01-03",
    });
  });
});

describe("getDefaultWeeklyReportRange", () => {
  it("周一默认返回上一周", () => {
    const result = getDefaultWeeklyReportRange(
      new Date("2026-11-23T10:00:00+08:00"),
    );

    expect(result).toEqual({
      weekStart: "2026-11-16",
      weekEnd: "2026-11-22",
      isMondayDefaultLastWeek: true,
    });
  });

  it("周一凌晨也按上海时区判断", () => {
    const result = getDefaultWeeklyReportRange(
      new Date("2026-11-23T00:30:00+08:00"),
    );

    expect(result.isMondayDefaultLastWeek).toBe(true);
    expect(result.weekStart).toBe("2026-11-16");
  });

  it("周二到周日默认返回本周", () => {
    for (const date of [
      "2026-11-24T10:00:00+08:00",
      "2026-11-26T10:00:00+08:00",
      "2026-11-29T10:00:00+08:00",
    ]) {
      const result = getDefaultWeeklyReportRange(new Date(date));

      expect(result).toEqual({
        weekStart: "2026-11-23",
        weekEnd: "2026-11-29",
        isMondayDefaultLastWeek: false,
      });
    }
  });

  it("周日深夜仍算本周，不会提前跳到上一周", () => {
    const result = getDefaultWeeklyReportRange(
      new Date("2026-11-29T23:30:00+08:00"),
    );

    expect(result.isMondayDefaultLastWeek).toBe(false);
    expect(result.weekStart).toBe("2026-11-23");
  });
});

describe("shiftWeek", () => {
  it("前后移动整周", () => {
    expect(shiftWeek("2026-11-23", -1)).toEqual({
      weekStart: "2026-11-16",
      weekEnd: "2026-11-22",
    });
    expect(shiftWeek("2026-11-23", 1)).toEqual({
      weekStart: "2026-11-30",
      weekEnd: "2026-12-06",
    });
  });

  it("跨年移动", () => {
    expect(shiftWeek("2026-12-28", 1)).toEqual({
      weekStart: "2027-01-04",
      weekEnd: "2027-01-10",
    });
    expect(shiftWeek("2027-01-04", -1)).toEqual({
      weekStart: "2026-12-28",
      weekEnd: "2027-01-03",
    });
  });

  it("传入周中日期时先归一到周一", () => {
    expect(shiftWeek("2026-11-26", 0)).toEqual({
      weekStart: "2026-11-23",
      weekEnd: "2026-11-29",
    });
  });
});

describe("summarizeActiveStudentsByGrade", () => {
  it("只统计在读学员，按年级汇总并给出总人数", () => {
    const students: StudentGrade[] = [
      { status: "在读", grade: "高一" },
      { status: "在读", grade: "高一" },
      { status: "在读", grade: "初二" },
      { status: "在读", grade: " 初一 " },
      { status: "停课", grade: "高一" },
      { status: "已结课", grade: "初三" },
      { status: "潜在", grade: "高二" },
    ];

    expect(summarizeActiveStudentsByGrade(students)).toBe(
      [
        "初一：1人",
        "初二：1人",
        "高一：2人",
        "合计：4人",
      ].join("\n"),
    );
  });

  it("空年级归入未填年级并排在最后", () => {
    const students: StudentGrade[] = [
      { status: "在读", grade: null },
      { status: "在读", grade: "   " },
      { status: "在读", grade: "高三" },
    ];

    expect(summarizeActiveStudentsByGrade(students)).toBe(
      ["高三：1人", "未填年级：2人", "合计：3人"].join("\n"),
    );
  });

  it("没有在读学员时返回明确提示", () => {
    expect(
      summarizeActiveStudentsByGrade([
        { status: "停课", grade: "高一" },
        { status: "已结课", grade: "初二" },
      ]),
    ).toBe("暂无在读学员");
  });
});

describe("createEmptyWeeklyReportContent", () => {
  it("名单类默认无，支持默认暂无", () => {
    const content = createEmptyWeeklyReportContent();

    expect(content.summary.miantan).toBe("");
    expect(content.summary.weixin).toBe("");
    expect(content.metrics.qingjia).toBe("无");
    expect(content.metrics.yujing).toBe("无");
    expect(content.metrics.tingke).toBe("无");
    expect(content.metrics.jieke).toBe("无");
    expect(content.metrics.kuoke).toBe("无");
    expect(content.metrics.xinqian).toBe("无");
    expect(content.metrics.xufei).toBe("无");
    expect(content.metrics.activeStudentsByGrade).toBe("暂无");
    expect(content.reflection).toBe("");
    expect(content.nextWeek.zhongdianHuifang).toBe("无");
    expect(content.nextWeek.jiazhanghui).toBe("无");
    expect(content.supportNeeded).toBe("暂无");
  });

  it("传入年级统计时直接写入", () => {
    const content = createEmptyWeeklyReportContent("高一：2人\n合计：2人");

    expect(content.metrics.activeStudentsByGrade).toBe(
      "高一：2人\n合计：2人",
    );
  });

  it("传入空白年级统计时回退为暂无", () => {
    expect(
      createEmptyWeeklyReportContent("   ").metrics.activeStudentsByGrade,
    ).toBe("暂无");
  });
});

describe("formatWeeklyReportPlainText", () => {
  it("按群消息格式输出完整周报", () => {
    const content = createEmptyWeeklyReportContent("高一：2人\n合计：2人");
    content.summary.miantan = "与 3 位家长面谈";
    content.metrics.yujing = "陈一鸣";
    content.nextWeek.zhongdianHuifang = "林小满";

    expect(
      formatWeeklyReportPlainText(content, {
        weekStart: "2026-11-23",
        weekEnd: "2026-11-29",
      }),
    ).toBe(
      [
        "本周工作周报（2026年11月23日 至 2026年11月29日）",
        "",
        "【本周工作总结】",
        "面谈：与 3 位家长面谈",
        "微信：无",
        "",
        "【本周数据汇总】",
        "请假：无",
        "预警名单：陈一鸣",
        "停课名单：无",
        "结课名单：无",
        "扩科：无",
        "新签：无",
        "续费：无",
        "在读学员年级及人数：",
        "高一：2人",
        "合计：2人",
        "",
        "【本周工作心得】",
        "暂无",
        "",
        "【下周工作安排】",
        "重点回访：林小满",
        "家长会：无",
        "",
        "【需要的支持】",
        "暂无",
      ].join("\n"),
    );
  });

  it("多行内容原样保留", () => {
    const content = createEmptyWeeklyReportContent("初一：1人\n初二：2人\n合计：3人");
    content.summary.miantan = "第一位家长\n第二位家长";
    content.summary.weixin = "第三条沟通";

    const output = formatWeeklyReportPlainText(content, {
      weekStart: "2026-11-23",
      weekEnd: "2026-11-29",
    });

    expect(output).toContain("面谈：第一位家长\n第二位家长");
    expect(output).toContain("微信：第三条沟通");
    expect(output).toContain("初一：1人\n初二：2人\n合计：3人");
  });
});
