import "./load-env";

import { gte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { usageEvents } from "@/lib/db/schema";
import {
  formatStatsMarkdown,
  summarizeEvents,
  type StatsEvent,
} from "@/lib/analytics/stats";

function readNumberArg(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  if (!arg) return fallback;

  const parsed = Number(arg.slice(prefix.length));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function main() {
  const days = readNumberArg("days", 30);
  const asJson = process.argv.includes("--json");
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await getDb()
    .select()
    .from(usageEvents)
    .where(gte(usageEvents.createdAt, since))
    .orderBy(usageEvents.createdAt);

  const events: StatsEvent[] = rows.map((row) => ({
    event: row.event,
    reviewDate: row.reviewDate,
    properties: row.properties,
    createdAt: row.createdAt.toISOString(),
  }));

  const summary = summarizeEvents(events);

  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`# 最近 ${days} 天使用统计\n`);
    console.log(formatStatsMarkdown(summary));
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("统计失败：", error);
    process.exit(1);
  });
