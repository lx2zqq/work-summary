import "server-only";

import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type AppDatabase = PgliteDatabase<typeof schema>;

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

    return drizzlePostgres(client, { schema }) as unknown as AppDatabase;
  }

  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[db] 未配置 DATABASE_URL，正在使用本地 PGlite。Vercel 等无状态环境请配置 Supabase 连接串。",
    );
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
