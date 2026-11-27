import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import ExcelJS from "exceljs";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/lib/db/schema";

vi.mock("server-only", () => ({}));

import { parseWeeklyReportResponse } from "@/lib/ai/weekly";
import {
  listActiveMemories,
  listActiveStudents,
  listWeeklySourceReviews,
} from "@/lib/db/queries";
import {
  buildDemoWeeklyGeneratedContent,
  buildDemoWeeklyReports,
} from "@/lib/demo-data";
import { weeklyReportContentSchema } from "@/lib/schema";
import { emptyDraft } from "@/lib/types";
import { buildWeeklyReportXlsx } from "@/lib/weekly-export";
import { summarizeActiveStudentsByGrade } from "@/lib/weekly-report";

let pglite: PGlite;
let db: PgliteDatabase<typeof schema>;

beforeAll(async () => {
  pglite = new PGlite();
  db = drizzle(pglite, { schema });
  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });

  (globalThis as unknown as { __reviewDb?: typeof db }).__reviewDb = db;
});

afterAll(async () => {
  delete (globalThis as unknown as { __reviewDb?: typeof db }).__reviewDb;
  await pglite.close();
});

beforeEach(async () => {
  await db.delete(schema.memories);
  await db.delete(schema.students);
  await db.delete(schema.reviews);
  await db.delete(schema.weeklyReports);
});

async function loadSheet(buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const worksheet = workbook.getWorksheet("Sheet1");
  if (!worksheet) throw new Error("缺少 Sheet1");
  return worksheet;
}

async function seedWeek() {
  await db.insert(schema.students).values([
    { name: "林小满", grade: "高一", status: "在读" },
    { name: "陈一鸣", grade: "初三", status: "在读" },
    { name: "周小禾", grade: "初二", status: "停课" },
  ]);

  const draftWithContent = {
    ...emptyDraft(),
    sections: {
      ...emptyDraft().sections,
      xueqing: ["完成数学作业，错题已讲解。"],
      jiaoxiao: ["妈妈微信确认本周排课。"],
    },
  };

  await db.insert(schema.reviews).values([
    {
      reviewDate: "2026-11-24",
      rawInput: "林小满作业写完了，错题讲了两道。",
      draft: draftWithContent,
      finalText: "林小满：完成数学作业，错题已讲解。",
    },
    {
      reviewDate: "2026-11-25",
      rawInput: "陈一鸣感冒请假，改到周六补课。",
      draft: emptyDraft(),
      finalText: "陈一鸣：感冒请假，改到周六补课。",
    },
    {
      reviewDate: "2026-11-26",
      rawInput: "林小满续费 1 单。",
      draft: emptyDraft(),
      finalText: "林小满：完成续费 1 单。",
    },
  ]);

  await db.insert(schema.memories).values([
    {
      scope: "student",
      studentName: "林小满",
      category: "家长沟通",
      content: "妈妈偏好微信沟通。",
      importance: 2,
      status: "active",
      lifecycle: "permanent",
    },
    {
      scope: "general",
      category: "工作流程",
      content: "每天 18:30 前把复盘发到钉钉群。",
      importance: 3,
      status: "active",
      lifecycle: "permanent",
    },
    {
      scope: "general",
      category: "工作流程",
      content: "已归档的旧流程。",
      importance: 1,
      status: "archived",
      lifecycle: "permanent",
    },
    {
      scope: "student",
      studentName: "陈一鸣",
      category: "课时排课",
      content: "上周临时调课。",
      importance: 2,
      status: "active",
      lifecycle: "ephemeral",
      expiresAt: new Date("2026-11-01T00:00:00.000Z"),
    },
  ]);
}

describe("周报端到端流程", () => {
  it("多篇日报 + 活跃记忆 + 在读学员组装后导出五大板块", async () => {
    await seedWeek();

    // 串行组装，和生成接口的读取顺序保持一致
    const reviews = await listWeeklySourceReviews(
      "2026-11-23",
      "2026-11-29",
    );
    const memories = await listActiveMemories();
    const students = await listActiveStudents();
    const activeStudentsByGrade =
      summarizeActiveStudentsByGrade(students);

    expect(reviews.map((item) => item.reviewDate)).toEqual([
      "2026-11-24",
      "2026-11-25",
      "2026-11-26",
    ]);
    expect(reviews[0]?.draft.sections.xueqing).toEqual([
      "完成数学作业，错题已讲解。",
    ]);
    expect(
      memories.map((item) => item.content).sort(),
    ).toEqual(
      ["妈妈偏好微信沟通。", "每天 18:30 前把复盘发到钉钉群。"].sort(),
    );
    expect(activeStudentsByGrade).toBe(
      "初三：1人\n高一：1人\n合计：2人",
    );

    // 自定义汇总区间只取区间内的日报
    const partial = await listWeeklySourceReviews(
      "2026-11-24",
      "2026-11-25",
    );
    expect(partial.map((item) => item.reviewDate)).toEqual([
      "2026-11-24",
      "2026-11-25",
    ]);

    // 模拟模型返回；模型算错的年级人数应被程序统计结果覆盖
    const raw = JSON.stringify({
      summary: {
        miantan:
          "林小满：沟通续费，家长确认周六到店。\n陈一鸣：确认周六补课。",
        weixin: "林小满妈妈：微信同步作业完成情况。",
      },
      metrics: {
        qingjia: "陈一鸣（感冒请假 1 天）",
        yujing: "无",
        tingke: "无",
        jieke: "无",
        kuoke: "无",
        xinqian: "无",
        xufei: "林小满（续费 1 单）",
        activeStudentsByGrade: "模型乱算：99人",
      },
      reflection:
        "1. 续费沟通先确认家长到店时间。\n2. 补课安排当天写进课表。",
      nextWeek: {
        zhongdianHuifang: "林小满：跟进续费后的课消进度。",
        jiazhanghui: "无",
      },
      supportNeeded: "暂无",
    });

    const parsed = parseWeeklyReportResponse(raw, activeStudentsByGrade);
    expect(parsed.error).toBe("");
    expect(parsed.content).not.toBeNull();

    const content = parsed.content!;
    expect(content.metrics.activeStudentsByGrade).toBe(
      activeStudentsByGrade,
    );

    const buffer = await buildWeeklyReportXlsx(content, {
      weekStart: "2026-11-23",
      weekEnd: "2026-11-29",
    });
    expect(buffer.length).toBeGreaterThan(1000);

    const worksheet = await loadSheet(buffer);

    // 1. 本周工作总结
    expect(worksheet.getCell("C3").value).toBe(
      `面谈：\n${content.summary.miantan}\n\n微信：\n${content.summary.weixin}`,
    );

    // 2. 本周数据汇总
    expect(worksheet.getCell("C17").value).toBe(
      "请假：陈一鸣（感冒请假 1 天）",
    );
    expect(worksheet.getCell("C18").value).toBe("预警名单：无");
    expect(worksheet.getCell("C19").value).toBe("停课名单：无");
    expect(worksheet.getCell("C20").value).toBe("结课名单：无");
    expect(worksheet.getCell("C21").value).toBe("扩科：无");
    expect(worksheet.getCell("C22").value).toBe("新签：无");
    expect(worksheet.getCell("C23").value).toBe(
      "续费：林小满（续费 1 单）",
    );
    expect(worksheet.getCell("C24").value).toBe(
      `在读学员年级及人数：\n${activeStudentsByGrade}`,
    );

    // 3. 本周工作心得
    expect(worksheet.getCell("C31").value).toBe(content.reflection);

    // 4. 下周工作安排
    expect(worksheet.getCell("C32").value).toBe(
      "重点回访：林小满：跟进续费后的课消进度。",
    );
    expect(worksheet.getCell("C33").value).toBe("家长会：无");

    // 5. 需要的支持
    expect(worksheet.getCell("C34").value).toBe("暂无");

    // 模板残留字符与合并区域
    expect(worksheet.getCell("J20").model).not.toHaveProperty("value");
    expect(worksheet.model.merges).toEqual(
      expect.arrayContaining([
        "C17:N17",
        "C23:N23",
        "C24:N30",
        "C34:N36",
      ]),
    );
  });

  it("演示周报样例全部通过 Zod 校验并可导出 xlsx", async () => {
    const reports = buildDemoWeeklyReports("2026-11-27");
    expect(reports.length).toBeGreaterThanOrEqual(2);
    expect(
      reports.some((item) => item.status === "finalized"),
    ).toBe(true);
    expect(reports.some((item) => item.status === "draft")).toBe(true);

    for (const report of reports) {
      expect(weeklyReportContentSchema.safeParse(report.content).success).toBe(
        true,
      );

      const buffer = await buildWeeklyReportXlsx(report.content, {
        weekStart: report.weekStart,
        weekEnd: report.weekEnd,
      });
      expect(buffer.length).toBeGreaterThan(1000);

      const worksheet = await loadSheet(buffer);

      expect(worksheet.getCell("C3").value).toBe(
        `面谈：\n${report.content.summary.miantan || "无"}\n\n微信：\n${
          report.content.summary.weixin || "无"
        }`,
      );
      expect(worksheet.getCell("C24").value).toBe(
        `在读学员年级及人数：\n${
          report.content.metrics.activeStudentsByGrade || "暂无"
        }`,
      );
      expect(worksheet.getCell("C31").value ?? "").toBe(
        report.content.reflection || "",
      );
      expect(worksheet.getCell("C34").value).toBe(
        report.content.supportNeeded || "暂无",
      );
    }

    expect(
      weeklyReportContentSchema.safeParse(
        buildDemoWeeklyGeneratedContent(),
      ).success,
    ).toBe(true);
  });
});
