import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/lib/db/schema";

vi.mock("server-only", () => ({}));

// 路由测试只关心业务分支，鉴权统一放行；其余响应工具保持真实实现
vi.mock("@/lib/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-helpers")>();
  return {
    ...actual,
    requireApiSession: async () => null,
  };
});

// 避免测试真的调用 DeepSeek，只验证路由的组装和落库
vi.mock("@/lib/ai/weekly", () => ({
  generateWeeklyReport: vi.fn(),
}));

import { AiError } from "@/lib/ai/deepseek";
import { generateWeeklyReport } from "@/lib/ai/weekly";
import { GET as getWeeklyReports } from "@/app/api/weekly-reports/route";
import { POST as generateWeeklyReportRoute } from "@/app/api/weekly-reports/generate/route";
import { PUT as putWeeklyReport } from "@/app/api/weekly-reports/[weekStart]/route";
import { GET as exportWeeklyReport } from "@/app/api/weekly-reports/[weekStart]/export/route";
import { POST as demoWeeklyExport } from "@/app/api/demo/weekly-export/route";
import { saveWeeklyReport } from "@/lib/db/queries";
import { emptyDraft, type WeeklyReportContent } from "@/lib/types";
import { createEmptyWeeklyReportContent } from "@/lib/weekly-report";

let pglite: PGlite;
let db: PgliteDatabase<typeof schema>;

beforeAll(async () => {
  pglite = new PGlite();
  db = drizzle(pglite, { schema });
  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });

  // 复用 getDb 的全局缓存，让路由直接使用内存库
  (globalThis as unknown as { __reviewDb?: typeof db }).__reviewDb = db;
});

afterAll(async () => {
  delete (globalThis as unknown as { __reviewDb?: typeof db }).__reviewDb;
  await pglite.close();
});

beforeEach(async () => {
  await db.delete(schema.weeklyReports);
  await db.delete(schema.reviews);
  await db.delete(schema.memories);
  await db.delete(schema.students);

  vi.mocked(generateWeeklyReport).mockReset();
  vi.stubEnv("REVIEW_DEEPSEEK_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function seedStudent(
  name: string,
  grade: string | null,
  status: "在读" | "停课" = "在读",
) {
  await db.insert(schema.students).values({ name, grade, status });
}

async function seedReview(date: string, finalText = "完成当日复盘。") {
  await db.insert(schema.reviews).values({
    reviewDate: date,
    rawInput: "原始流水账",
    draft: emptyDraft(),
    finalText,
  });
}

function buildContent(): WeeklyReportContent {
  const content = createEmptyWeeklyReportContent("高一：2人\n合计：2人");
  content.summary.miantan = "林小满：沟通续费。";
  content.metrics.xufei = "林小满";
  content.reflection = "续费沟通要先确认家长到店时间。";
  content.nextWeek.zhongdianHuifang = "林小满：确认续费到店。";
  return content;
}

function jsonRequest(url: string, body: unknown, ip: string): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-real-ip": ip,
    },
    body: JSON.stringify(body),
  });
}

describe("GET /api/weekly-reports", () => {
  it("归一到周一，返回来源日期和在读人数", async () => {
    await seedStudent("林小满", "高一");
    await seedStudent("陈一鸣", "高一");
    await seedStudent("周小禾", "初二", "停课");
    await seedReview("2026-11-23");
    await seedReview("2026-11-25");

    const response = await getWeeklyReports(
      new Request("http://localhost/api/weekly-reports?weekStart=2026-11-25"),
    );
    expect(response.status).toBe(200);

    const data = (await response.json()) as {
      weekStart: string;
      weekEnd: string;
      isMondayDefaultLastWeek: boolean;
      report: unknown;
      sourceReviews: string[];
      computedActiveStudentsByGrade: string;
    };

    expect(data.weekStart).toBe("2026-11-23");
    expect(data.weekEnd).toBe("2026-11-29");
    expect(data.isMondayDefaultLastWeek).toBe(false);
    expect(data.report).toBeNull();
    expect(data.sourceReviews).toEqual(["2026-11-23", "2026-11-25"]);
    expect(data.computedActiveStudentsByGrade).toBe("高一：2人\n合计：2人");
  });

  it("支持自定义汇总区间", async () => {
    await seedReview("2026-11-23");
    await seedReview("2026-11-24");
    await seedReview("2026-11-25");

    const response = await getWeeklyReports(
      new Request(
        "http://localhost/api/weekly-reports?weekStart=2026-11-25&sourceStartDate=2026-11-23&sourceEndDate=2026-11-24",
      ),
    );
    const data = (await response.json()) as { sourceReviews: string[] };

    expect(data.sourceReviews).toEqual(["2026-11-23", "2026-11-24"]);
  });

  it("返回已保存的周报", async () => {
    await saveWeeklyReport({
      weekStart: "2026-11-23",
      weekEnd: "2026-11-29",
      content: buildContent(),
      status: "finalized",
      sourceReviewCount: 2,
      generatedAt: new Date("2026-11-29T10:00:00.000Z"),
    });

    const response = await getWeeklyReports(
      new Request("http://localhost/api/weekly-reports?weekStart=2026-11-23"),
    );
    const data = (await response.json()) as {
      report: { status: string; content: WeeklyReportContent } | null;
    };

    expect(data.report?.status).toBe("finalized");
    expect(data.report?.content.metrics.xufei).toBe("林小满");
  });

  it("拒绝超过 14 天的自定义区间", async () => {
    const response = await getWeeklyReports(
      new Request(
        "http://localhost/api/weekly-reports?weekStart=2026-11-23&sourceStartDate=2026-11-01&sourceEndDate=2026-11-15",
      ),
    );

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: string };
    expect(data.error).toContain("14 天");
  });
});

describe("POST /api/weekly-reports/generate", () => {
  it("生成周报并 upsert 到数据库", async () => {
    await seedStudent("林小满", "高一");
    await seedReview("2026-11-24");
    vi.mocked(generateWeeklyReport).mockResolvedValue(buildContent());

    const response = await generateWeeklyReportRoute(
      jsonRequest(
        "http://localhost/api/weekly-reports/generate",
        { weekStart: "2026-11-25" },
        "10.0.1.1",
      ),
    );
    expect(response.status).toBe(200);

    const data = (await response.json()) as {
      report: {
        weekStart: string;
        weekEnd: string;
        status: string;
        sourceReviewCount: number;
        generatedAt: string | null;
      };
    };

    expect(data.report.weekStart).toBe("2026-11-23");
    expect(data.report.weekEnd).toBe("2026-11-29");
    expect(data.report.status).toBe("draft");
    expect(data.report.sourceReviewCount).toBe(1);
    expect(data.report.generatedAt).toBeTruthy();

    expect(vi.mocked(generateWeeklyReport)).toHaveBeenCalledTimes(1);
    const input = vi.mocked(generateWeeklyReport).mock.calls[0][0];
    expect(input.activeStudentsByGrade).toBe("高一：1人\n合计：1人");
    expect(input.reviews).toHaveLength(1);
    expect(input.reviews[0].reviewDate).toBe("2026-11-24");
  });

  it("支持自定义汇总区间并记录来源篇数", async () => {
    await seedReview("2026-11-01");
    await seedReview("2026-11-02");
    vi.mocked(generateWeeklyReport).mockResolvedValue(buildContent());

    const response = await generateWeeklyReportRoute(
      jsonRequest(
        "http://localhost/api/weekly-reports/generate",
        {
          weekStart: "2026-11-23",
          sourceStartDate: "2026-11-01",
          sourceEndDate: "2026-11-02",
        },
        "10.0.1.2",
      ),
    );
    const data = (await response.json()) as {
      report: { sourceReviewCount: number };
    };

    expect(response.status).toBe(200);
    expect(data.report.sourceReviewCount).toBe(2);
  });

  it("区间内没有日报时返回 400", async () => {
    const response = await generateWeeklyReportRoute(
      jsonRequest(
        "http://localhost/api/weekly-reports/generate",
        { weekStart: "2026-11-23" },
        "10.0.1.3",
      ),
    );

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: string };
    expect(data.error).toContain("暂无日报");
    expect(vi.mocked(generateWeeklyReport)).not.toHaveBeenCalled();
  });

  it("未配置模型 Key 时返回 503", async () => {
    vi.stubEnv("REVIEW_DEEPSEEK_API_KEY", "");

    const response = await generateWeeklyReportRoute(
      jsonRequest(
        "http://localhost/api/weekly-reports/generate",
        { weekStart: "2026-11-23" },
        "10.0.1.4",
      ),
    );

    expect(response.status).toBe(503);
    const data = (await response.json()) as { error: string };
    expect(data.error).toContain("REVIEW_DEEPSEEK_API_KEY");
  });

  it("拒绝超过 14 天的汇总区间", async () => {
    const response = await generateWeeklyReportRoute(
      jsonRequest(
        "http://localhost/api/weekly-reports/generate",
        {
          weekStart: "2026-11-23",
          sourceStartDate: "2026-11-01",
          sourceEndDate: "2026-11-15",
        },
        "10.0.1.5",
      ),
    );

    expect(response.status).toBe(400);
    expect(vi.mocked(generateWeeklyReport)).not.toHaveBeenCalled();
  });

  it("模型生成失败时返回可读错误", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await seedReview("2026-11-24");
    vi.mocked(generateWeeklyReport).mockRejectedValue(
      new AiError("周报生成结果格式不对，已自动重试一次，请稍后再试", "output"),
    );

    const response = await generateWeeklyReportRoute(
      jsonRequest(
        "http://localhost/api/weekly-reports/generate",
        { weekStart: "2026-11-23" },
        "10.0.1.6",
      ),
    );

    expect(response.status).toBe(502);
    const data = (await response.json()) as { error: string };
    expect(data.error).toContain("格式不对");
  });

  it("同一 IP 超过限流阈值返回 429", async () => {
    const ip = "10.0.1.99";

    // 前 8 次即使因为无日报返回 400，也会占用限流额度
    for (let index = 0; index < 8; index += 1) {
      await generateWeeklyReportRoute(
        jsonRequest(
          "http://localhost/api/weekly-reports/generate",
          { weekStart: "2026-11-23" },
          ip,
        ),
      );
    }

    const response = await generateWeeklyReportRoute(
      jsonRequest(
        "http://localhost/api/weekly-reports/generate",
        { weekStart: "2026-11-23" },
        ip,
      ),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBeTruthy();
  });
});

describe("PUT /api/weekly-reports/[weekStart]", () => {
  it("保存编辑内容并归一到周一", async () => {
    const response = await putWeeklyReport(
      jsonRequest(
        "http://localhost/api/weekly-reports/2026-11-25",
        { content: buildContent(), status: "finalized" },
        "10.0.2.1",
      ),
      { params: Promise.resolve({ weekStart: "2026-11-25" }) },
    );
    expect(response.status).toBe(200);

    const data = (await response.json()) as {
      report: {
        weekStart: string;
        status: string;
        sourceReviewCount: number;
        generatedAt: string | null;
      };
    };

    expect(data.report.weekStart).toBe("2026-11-23");
    expect(data.report.status).toBe("finalized");
    expect(data.report.sourceReviewCount).toBe(0);
    expect(data.report.generatedAt).toBeNull();
  });

  it("重复保存只保留一条记录，并保留生成信息", async () => {
    await saveWeeklyReport({
      weekStart: "2026-11-23",
      weekEnd: "2026-11-29",
      content: buildContent(),
      status: "draft",
      sourceReviewCount: 3,
      generatedAt: new Date("2026-11-29T10:00:00.000Z"),
    });

    const response = await putWeeklyReport(
      jsonRequest(
        "http://localhost/api/weekly-reports/2026-11-23",
        { content: buildContent(), status: "finalized" },
        "10.0.2.2",
      ),
      { params: Promise.resolve({ weekStart: "2026-11-23" }) },
    );

    const data = (await response.json()) as {
      report: {
        sourceReviewCount: number;
        generatedAt: string | null;
        status: string;
      };
    };

    expect(response.status).toBe(200);
    expect(data.report.sourceReviewCount).toBe(3);
    expect(data.report.generatedAt).toBeTruthy();
    expect(data.report.status).toBe("finalized");

    const rows = await db.select().from(schema.weeklyReports);
    expect(rows).toHaveLength(1);
  });

  it("拒绝缺少 content 的请求", async () => {
    const response = await putWeeklyReport(
      jsonRequest(
        "http://localhost/api/weekly-reports/2026-11-23",
        { status: "draft" },
        "10.0.2.3",
      ),
      { params: Promise.resolve({ weekStart: "2026-11-23" }) },
    );

    expect(response.status).toBe(400);
  });
});

describe("GET /api/weekly-reports/[weekStart]/export", () => {
  it("导出 xlsx 并设置中文文件名", async () => {
    await saveWeeklyReport({
      weekStart: "2026-11-23",
      weekEnd: "2026-11-29",
      content: buildContent(),
      status: "finalized",
      sourceReviewCount: 2,
      generatedAt: new Date("2026-11-29T10:00:00.000Z"),
    });

    const response = await exportWeeklyReport(
      new Request("http://localhost/api/weekly-reports/2026-11-23/export"),
      { params: Promise.resolve({ weekStart: "2026-11-23" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "spreadsheetml.sheet",
    );

    const disposition = response.headers.get("content-disposition") ?? "";
    expect(disposition).toContain("filename*=UTF-8''");
    expect(disposition).toContain(
      encodeURIComponent("周报_2026-11-23_2026-11-29.xlsx"),
    );

    const buffer = await response.arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it("该周没有周报时返回 404", async () => {
    const response = await exportWeeklyReport(
      new Request("http://localhost/api/weekly-reports/2026-11-23/export"),
      { params: Promise.resolve({ weekStart: "2026-11-23" }) },
    );

    expect(response.status).toBe(404);
    const data = (await response.json()) as { error: string };
    expect(data.error).toContain("还没有周报");
  });
});

describe("POST /api/demo/weekly-export", () => {
  it("免登录导出演示周报", async () => {
    const response = await demoWeeklyExport(
      jsonRequest(
        "http://localhost/api/demo/weekly-export",
        {
          weekStart: "2026-11-23",
          weekEnd: "2026-11-29",
          content: buildContent(),
        },
        "10.0.3.1",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "spreadsheetml.sheet",
    );
    const buffer = await response.arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it("拒绝不是完整自然周的区间", async () => {
    const response = await demoWeeklyExport(
      jsonRequest(
        "http://localhost/api/demo/weekly-export",
        {
          weekStart: "2026-11-23",
          weekEnd: "2026-11-28",
          content: buildContent(),
        },
        "10.0.3.2",
      ),
    );

    expect(response.status).toBe(400);
  });

  it("拒绝缺少字段的正文", async () => {
    const response = await demoWeeklyExport(
      jsonRequest(
        "http://localhost/api/demo/weekly-export",
        {
          weekStart: "2026-11-23",
          weekEnd: "2026-11-29",
          content: { summary: { miantan: "只有一段" } },
        },
        "10.0.3.3",
      ),
    );

    expect(response.status).toBe(400);
  });
});
