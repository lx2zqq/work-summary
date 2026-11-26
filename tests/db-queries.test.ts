import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/lib/db/schema";
import {
  createMemory,
  createStudent,
  listMemories,
  listReviews,
  mutateCustomPhrases,
  saveExtractedMemories,
  saveReview,
  updateMemory,
  updateStudent,
} from "@/lib/db/queries";
import { emptyDraft } from "@/lib/types";

// queries.ts 依赖 server-only 标记包，测试环境用空模块替代
vi.mock("server-only", () => ({}));

let pglite: PGlite;
let db: PgliteDatabase<typeof schema>;

beforeAll(async () => {
  pglite = new PGlite();
  db = drizzle(pglite, { schema });
  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });

  // 复用 getDb 的全局缓存，让 queries.ts 直接使用内存库
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
});

describe("updateStudent", () => {
  it("学生改名后同步关联记忆的 studentName", async () => {
    const target = await createStudent({
      name: "林小满",
      grade: "高一",
      subjects: "数学",
      status: "在读",
      note: null,
    });
    const other = await createStudent({
      name: "陈一鸣",
      grade: "高二",
      subjects: "英语",
      status: "在读",
      note: null,
    });

    const linked = await createMemory({
      scope: "student",
      studentId: target.id,
      studentName: "林小满",
      category: "家长沟通",
      content: "林小满妈妈偏好微信沟通。",
      importance: 2,
    });
    const otherLinked = await createMemory({
      scope: "student",
      studentId: other.id,
      studentName: "陈一鸣",
      category: "学习习惯",
      content: "陈一鸣需要每周检查一次错题。",
      importance: 2,
    });
    const general = await createMemory({
      scope: "general",
      studentId: null,
      studentName: null,
      category: "工作流程",
      content: "每周五汇总本周课时。",
      importance: 1,
    });

    const updated = await updateStudent(target.id, {
      name: "林小满（小满）",
      grade: "高一",
      subjects: "数学",
      status: "在读",
      note: null,
    });

    expect(updated?.name).toBe("林小满（小满）");

    const memories = await listMemories(20);
    const byId = new Map(memories.map((memory) => [memory.id, memory]));

    expect(byId.get(linked.id)?.studentName).toBe("林小满（小满）");
    expect(byId.get(otherLinked.id)?.studentName).toBe("陈一鸣");
    expect(byId.get(general.id)?.studentName).toBeNull();
  });
});

describe("listReviews", () => {
  it("按 beforeDate 游标向前翻页", async () => {
    const dates = [
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
    ];

    for (const date of dates) {
      await saveReview({
        date,
        rawInput: "测试",
        draft: emptyDraft(),
        finalText: "",
        style: "concise",
        conversation: [],
        round: 0,
      });
    }

    const first = await listReviews(2);
    expect(first.map((item) => item.reviewDate)).toEqual([
      "2026-11-04",
      "2026-11-03",
    ]);

    const next = await listReviews(2, first[1]?.reviewDate);
    expect(next.map((item) => item.reviewDate)).toEqual([
      "2026-11-02",
      "2026-11-01",
    ]);

    expect(await listReviews(2, "2026-11-01")).toEqual([]);
  });
});

describe("updateMemory", () => {
  it("不传 status 时保留原有状态", async () => {
    const memory = await createMemory({
      scope: "general",
      studentId: null,
      studentName: null,
      category: "工作流程",
      content: "每周五汇总本周课时。",
      importance: 2,
    });

    await db
      .update(schema.memories)
      .set({ status: "archived" })
      .where(eq(schema.memories.id, memory.id));

    const updated = await updateMemory(memory.id, {
      scope: "general",
      studentId: null,
      studentName: null,
      category: "工作流程",
      content: "每周五汇总本周课时和作业。",
      importance: 2,
    });

    expect(updated?.status).toBe("archived");
    expect(updated?.content).toBe("每周五汇总本周课时和作业。");
  });
});

describe("saveExtractedMemories", () => {
  it("事务内写入记忆并跳过重复项", async () => {
    const result = await saveExtractedMemories({
      date: "2026-11-26",
      students: [],
      items: [
        {
          scope: "general",
          studentName: null,
          category: "工作流程",
          content: "每周五汇总本周课时。",
          importance: 2,
        },
        {
          scope: "general",
          studentName: null,
          category: "工作流程",
          content: "每周五汇总本周课时。",
          importance: 2,
        },
      ],
    });

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(await listMemories(20)).toHaveLength(1);
  });
});

describe("mutateCustomPhrases", () => {
  it("在事务内读取并写回自定义话术", async () => {
    await db.delete(schema.settings);

    const result = await mutateCustomPhrases((current) => ({
      next: [
        ...current,
        {
          id: "phrase-test",
          theme: "general",
          content: "每天下班前把作业情况发到家长群。",
          createdAt: new Date().toISOString(),
        },
      ],
    }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.phrases.map((item) => item.id)).toEqual(["phrase-test"]);
    }
  });
});
