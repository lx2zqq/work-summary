import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/lib/db/schema";
import {
  archiveMemory,
  createMemory,
  createStudent,
  findMemories,
  keepMemory,
  listMemories,
  listPendingArchiveMemories,
  listReviews,
  mutateCustomPhrases,
  restoreMemory,
  saveExtractedMemories,
  saveReview,
  syncMemoryLifecycle,
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

describe("记忆生命周期", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const baseInput = {
    scope: "general" as const,
    studentId: null,
    studentName: null,
    category: "工作流程" as const,
    content: "本周五前提交续费名单。",
    importance: 2,
  };

  it("阶段性记忆过期后进入待归档，宽限期结束自动归档", async () => {
    const now = new Date("2026-11-27T10:00:00.000Z");
    const expired = await createMemory({
      ...baseInput,
      lifecycle: "ephemeral",
      expiresAt: new Date("2026-11-27T09:00:00.000Z").toISOString(),
    });
    const fresh = await createMemory({
      ...baseInput,
      content: "下周一开始新的排课周期。",
      lifecycle: "ephemeral",
      expiresAt: new Date("2026-11-30T09:00:00.000Z").toISOString(),
    });

    const first = await syncMemoryLifecycle(now);
    expect(first.pending).toBe(1);
    expect(first.archived).toBe(0);

    let listed = await listMemories(20);
    const pending = listed.find((item) => item.id === expired.id);
    const stillActive = listed.find((item) => item.id === fresh.id);

    expect(pending?.status).toBe("pending_archive");
    expect(pending?.archiveReason).toBe("已过建议时效");
    expect(pending?.archiveAfter).toBe(
      new Date(now.getTime() + 5 * DAY_MS).toISOString(),
    );
    expect(stillActive?.status).toBe("active");

    const later = new Date(now.getTime() + 6 * DAY_MS);
    const second = await syncMemoryLifecycle(later);
    expect(second.archived).toBe(1);

    listed = await listMemories(20);
    expect(listed.find((item) => item.id === expired.id)?.status).toBe(
      "archived",
    );
    expect(listed.find((item) => item.id === fresh.id)?.status).toBe(
      "pending_archive",
    );
  });

  it("keepMemory 支持转为长期或顺延 7 天", async () => {
    const now = new Date("2026-11-27T10:00:00.000Z");
    const first = await createMemory({
      ...baseInput,
      lifecycle: "ephemeral",
      expiresAt: new Date("2026-11-27T09:00:00.000Z").toISOString(),
    });
    const second = await createMemory({
      ...baseInput,
      content: "下周补课安排。",
      lifecycle: "ephemeral",
      expiresAt: new Date("2026-11-27T09:00:00.000Z").toISOString(),
    });

    await syncMemoryLifecycle(now);

    const kept = await keepMemory(first.id, "permanent");
    expect(kept?.status).toBe("active");
    expect(kept?.lifecycle).toBe("permanent");
    expect(kept?.expiresAt).toBeNull();
    expect(kept?.archiveAfter).toBeNull();
    expect(kept?.archiveReason).toBeNull();

    const extended = await keepMemory(second.id, "extend_7d");
    expect(extended?.status).toBe("active");
    expect(extended?.lifecycle).toBe("ephemeral");
    expect(extended?.expiresAt).not.toBeNull();
    expect(new Date(extended?.expiresAt ?? 0).getTime()).toBeGreaterThan(
      Date.now() + 6 * DAY_MS,
    );
  });

  it("archiveMemory 立即归档，restoreMemory 恢复为长期", async () => {
    const memory = await createMemory(baseInput);

    const archived = await archiveMemory(memory.id);
    expect(archived?.status).toBe("archived");
    expect(archived?.archiveReason).toBe("手动归档");

    const restored = await restoreMemory(memory.id);
    expect(restored?.status).toBe("active");
    expect(restored?.lifecycle).toBe("permanent");
    expect(restored?.expiresAt).toBeNull();
    expect(restored?.archiveReason).toBeNull();
  });

  it("findMemories 过滤已归档和已过期记忆", async () => {
    const active = await createMemory(baseInput);
    const archived = await createMemory({
      ...baseInput,
      content: "已归档记忆。",
    });
    const expired = await createMemory({
      ...baseInput,
      content: "已过期记忆。",
      lifecycle: "ephemeral",
      expiresAt: new Date(Date.now() - DAY_MS).toISOString(),
    });

    await archiveMemory(archived.id);

    const ids = (await findMemories({ limit: 20 })).map((item) => item.id);
    expect(ids).toContain(active.id);
    expect(ids).not.toContain(archived.id);
    expect(ids).not.toContain(expired.id);
  });

  it("提取阶段性记忆时写入过期时间", async () => {
    const before = Date.now();
    const result = await saveExtractedMemories({
      date: "2026-11-27",
      students: [],
      items: [
        {
          scope: "general",
          studentName: null,
          category: "工作流程",
          content: "本周五前提交续费名单。",
          importance: 2,
          lifecycle: "ephemeral",
          ttlDays: 3,
        },
      ],
    });

    expect(result.created).toBe(1);

    const [memory] = await listMemories(20);
    expect(memory.lifecycle).toBe("ephemeral");
    expect(memory.expiresAt).not.toBeNull();

    const expiresAt = new Date(memory.expiresAt ?? 0).getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + 3 * DAY_MS - 1000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 3 * DAY_MS + 1000);
  });

  it("提取更新为长期时清空过期时间与归档字段", async () => {
    const memory = await createMemory({
      ...baseInput,
      lifecycle: "ephemeral",
      expiresAt: new Date(Date.now() + 3 * DAY_MS).toISOString(),
    });

    await db
      .update(schema.memories)
      .set({
        archiveAfter: new Date(Date.now() + DAY_MS),
        archiveReason: "旧原因",
      })
      .where(eq(schema.memories.id, memory.id));

    await saveExtractedMemories({
      date: "2026-11-27",
      students: [],
      items: [
        {
          id: memory.id,
          scope: "general",
          studentName: null,
          category: "工作流程",
          content: "改成长期规范。",
          importance: 3,
          lifecycle: "permanent",
        },
      ],
    });

    const [updated] = await listMemories(20);
    expect(updated.lifecycle).toBe("permanent");
    expect(updated.expiresAt).toBeNull();
    expect(updated.archiveAfter).toBeNull();
    expect(updated.archiveReason).toBeNull();
  });

  it("listPendingArchiveMemories 只返回待归档记忆", async () => {
    const now = new Date("2026-11-27T10:00:00.000Z");
    const expired = await createMemory({
      ...baseInput,
      lifecycle: "ephemeral",
      expiresAt: new Date("2026-11-27T09:00:00.000Z").toISOString(),
    });
    await createMemory({
      ...baseInput,
      content: "长期记忆。",
    });

    await syncMemoryLifecycle(now);

    const pending = await listPendingArchiveMemories(20);
    expect(pending.map((item) => item.id)).toEqual([expired.id]);
  });
});
