import { describe, expect, it } from "vitest";
import path from "node:path";
import ExcelJS from "exceljs";
import { createEmptyWeeklyReportContent } from "@/lib/weekly-report";
import {
  buildWeeklyReportXlsx,
  fitRowHeight,
} from "@/lib/weekly-export";
import type { WeeklyReportContent, WeeklyReportMeta } from "@/lib/types";

const meta: WeeklyReportMeta = {
  weekStart: "2026-11-23",
  weekEnd: "2026-11-29",
};

function buildContent(): WeeklyReportContent {
  return {
    summary: {
      miantan: "本周与 3 位家长面谈。",
      weixin: "微信沟通 5 位家长。",
    },
    metrics: {
      qingjia: "林小满（1 天）",
      yujing: "陈一鸣、周小禾",
      tingke: "无",
      jieke: "赵小满",
      kuoke: "林小满",
      xinqian: "陈一鸣",
      xufei: "周小禾",
      activeStudentsByGrade: "初二：1人\n高一：2人\n合计：3人",
    },
    reflection: "本周重点跟进了高一两名学生的作业情况。",
    nextWeek: {
      zhongdianHuifang: "陈一鸣",
      jiazhanghui: "周六下午",
    },
    supportNeeded: "需要教务协助排课。",
  };
}

async function load(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  // exceljs 的 Buffer 类型是 ArrayBuffer 子类型，Node Buffer 运行时可以直接读取
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

function getSheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet {
  const worksheet = workbook.getWorksheet("Sheet1");
  if (!worksheet) throw new Error("缺少 Sheet1");
  return worksheet;
}

describe("buildWeeklyReportXlsx", () => {
  it("写入关键单元格并保留模板样式", async () => {
    const buffer = await buildWeeklyReportXlsx(buildContent(), meta);
    expect(buffer.length).toBeGreaterThan(0);

    const workbook = await load(buffer);
    const worksheet = getSheet(workbook);

    expect(worksheet.getCell("C3").value).toBe(
      "面谈：\n本周与 3 位家长面谈。\n\n微信：\n微信沟通 5 位家长。",
    );
    expect(worksheet.getCell("C17").value).toBe("请假：林小满（1 天）");
    expect(worksheet.getCell("C18").value).toBe("预警名单：陈一鸣、周小禾");
    expect(worksheet.getCell("C19").value).toBe("停课名单：无");
    expect(worksheet.getCell("C20").value).toBe("结课名单：赵小满");
    expect(worksheet.getCell("C21").value).toBe("扩科：林小满");
    expect(worksheet.getCell("C22").value).toBe("新签：陈一鸣");
    expect(worksheet.getCell("C23").value).toBe("续费：周小禾");
    expect(worksheet.getCell("C24").value).toBe(
      "在读学员年级及人数：\n初二：1人\n高一：2人\n合计：3人",
    );
    expect(worksheet.getCell("C31").value).toBe(
      "本周重点跟进了高一两名学生的作业情况。",
    );
    expect(worksheet.getCell("C32").value).toBe("重点回访：陈一鸣");
    expect(worksheet.getCell("C33").value).toBe("家长会：周六下午");
    expect(worksheet.getCell("C34").value).toBe("需要教务协助排课。");

    // J20 合并后属于 C20:N20，物理单元格本身不再带值
    expect(worksheet.getCell("J20").model).not.toHaveProperty("value");

    // 模板原有的合并区域全部保留，同时补齐 C17:N17 到 C23:N23
    expect(worksheet.model.merges).toEqual(
      expect.arrayContaining([
        "A1:N2",
        "A3:B16",
        "C3:N16",
        "A17:B30",
        "C17:N17",
        "C18:N18",
        "C19:N19",
        "C20:N20",
        "C21:N21",
        "C22:N22",
        "C23:N23",
        "C24:N30",
        "A31:B31",
        "C31:N31",
        "A32:B33",
        "C32:N32",
        "C33:N33",
        "A34:B36",
        "C34:N36",
      ]),
    );
    expect(worksheet.model.merges).toHaveLength(19);

    const c17 = worksheet.getCell("C17");
    expect(c17.font?.name).toBe("宋体");
    expect(c17.border?.left?.style).toBe("thin");
    expect(c17.alignment?.wrapText).toBe(true);

    expect(workbook.title).toBe("周报 2026-11-23 至 2026-11-29");
  });

  it("空内容导出使用无/暂无兜底", async () => {
    const buffer = await buildWeeklyReportXlsx(
      createEmptyWeeklyReportContent(),
      meta,
    );
    const worksheet = getSheet(await load(buffer));

    expect(worksheet.getCell("C3").value).toBe("面谈：\n无\n\n微信：\n无");
    expect(worksheet.getCell("C17").value).toBe("请假：无");
    expect(worksheet.getCell("C24").value).toBe(
      "在读学员年级及人数：\n暂无",
    );
    expect(worksheet.getCell("C31").value ?? "").toBe("");
    expect(worksheet.getCell("C34").value).toBe("暂无");
  });

  it("长名单自动加高行高，避免导出截断", async () => {
    const content = buildContent();
    content.metrics.qingjia = Array.from(
      { length: 20 },
      (_, index) => `学生${index + 1}`,
    ).join("、");

    const worksheet = getSheet(
      await load(await buildWeeklyReportXlsx(content, meta)),
    );

    expect(worksheet.getRow(17).height).toBeGreaterThan(14);
    expect(worksheet.getCell("C17").alignment?.wrapText).toBe(true);
  });

  it("长总结会加高合并区域的锚点行", async () => {
    const content = buildContent();
    content.summary.miantan = Array.from(
      { length: 20 },
      (_, index) => `第 ${index + 1} 条面谈记录`,
    ).join("\n");

    const worksheet = getSheet(
      await load(await buildWeeklyReportXlsx(content, meta)),
    );

    expect(worksheet.getRow(3).height).toBeGreaterThan(14);
  });

  it("合并块按真实行高计算容量，避免撑出多余空白", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(
      path.join(process.cwd(), "templates", "weekly-report-template.xlsx"),
    );
    const worksheet = workbook.getWorksheet("Sheet1");
    if (!worksheet) throw new Error("缺少 Sheet1");

    // C3:N16 的最后一行在模板里自带较大行高
    worksheet.getRow(16).height = 200;
    const text = Array.from(
      { length: 19 },
      (_, index) => `第 ${index + 1} 行`,
    ).join("\n");

    fitRowHeight(worksheet, 3, text, 14);

    // 真实合计高度已经足够，锚点行不应再被撑高
    expect(worksheet.getRow(3).height ?? 14).toBe(14);
  });

  it("重复导出不会重复合并或报错", async () => {
    await expect(
      buildWeeklyReportXlsx(buildContent(), meta),
    ).resolves.toBeInstanceOf(Buffer);
    await expect(
      buildWeeklyReportXlsx(buildContent(), meta),
    ).resolves.toBeInstanceOf(Buffer);
  });
});
