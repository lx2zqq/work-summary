import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// 这里不放 server-only：Node 脚本（统计、迁移后校验）也要复用同一套连接逻辑。
// 页面和接口请统一从 "@/lib/db" 导入，那个入口有 server-only 保护。

/** 两种驱动共用的查询接口，查询层只依赖这里 */
export type AppDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

type GlobalDb = {
  __reviewDb?: AppDatabase;
  __pglite?: PGlite;
  __pg?: ReturnType<typeof postgres>;
};

const globalForDb = globalThis as unknown as GlobalDb;

/** 清掉 Prisma 专用参数，postgres.js 会把这些参数当 PostgreSQL 启动参数 */
function normalizeDatabaseUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.searchParams.delete("pgbouncer");
    url.searchParams.delete("connection_limit");
    return url.toString();
  } catch {
    return raw;
  }
}

function createDb(): AppDatabase {
  const rawUrl = process.env.DATABASE_URL?.trim();
  const url = rawUrl ? normalizeDatabaseUrl(rawUrl) : "";

  // 生产环境必须用真实数据库，禁止静默回退到 PGlite 导致数据丢失
  if (!url && process.env.NODE_ENV === "production") {
    throw new Error(
      "生产环境必须配置 DATABASE_URL（Supabase/Postgres），不能使用 PGlite",
    );
  }

  if (url) {
    const client =
      globalForDb.__pg ??
      postgres(url, {
        prepare: false,
        max: 1,
        idle_timeout: 20,
        connect_timeout: 10,
      });

    if (process.env.NODE_ENV !== "production") {
      globalForDb.__pg = client;
    }

    return drizzlePostgres(client, { schema }) as AppDatabase;
  }

  const dataDir =
    process.env.PGLITE_DATA_DIR?.trim() ||
    path.join(process.cwd(), ".data", "pglite");

  fs.mkdirSync(path.dirname(dataDir), { recursive: true });

  const pglite = globalForDb.__pglite ?? new PGlite(dataDir);

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__pglite = pglite;
  }

  return drizzlePglite(pglite, { schema });
}

let dbInstance: AppDatabase | null = null;

/** 懒加载数据库连接，避免 Next 构建 worker 同时初始化 PGlite */
export function getDb(): AppDatabase {
  if (globalForDb.__reviewDb) return globalForDb.__reviewDb;
  if (dbInstance) return dbInstance;

  dbInstance = createDb();
  globalForDb.__reviewDb = dbInstance;
  return dbInstance;
}
