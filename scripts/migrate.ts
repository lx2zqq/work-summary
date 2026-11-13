import "./load-env";

import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

function normalizeDatabaseUrl(raw: string): string {
  try {
    const url = new URL(raw);
    // Prisma 专用参数，postgres.js 会当成 PostgreSQL 启动参数而报错
    url.searchParams.delete("pgbouncer");
    url.searchParams.delete("connection_limit");
    return url.toString();
  } catch {
    return raw;
  }
}

async function main() {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  const rawUrl = process.env.DATABASE_URL?.trim();
  const url = rawUrl ? normalizeDatabaseUrl(rawUrl) : "";

  if (url) {
    const client = postgres(url, { prepare: false, max: 1 });
    const db = drizzlePostgres(client);
    await migratePostgres(db, { migrationsFolder });
    await client.end();
    console.log("✓ Supabase / Postgres 迁移完成");
    return;
  }

  const dataDir =
    process.env.PGLITE_DATA_DIR?.trim() ||
    path.join(process.cwd(), ".data", "pglite");
  fs.mkdirSync(path.dirname(dataDir), { recursive: true });
  const pglite = new PGlite(dataDir);
  const db = drizzlePglite(pglite);
  await migratePglite(db, { migrationsFolder });
  await pglite.close();
  console.log(`✓ 本地 PGlite 迁移完成：${dataDir}`);
}

main().catch((error) => {
  console.error("迁移失败：", error);
  process.exit(1);
});
