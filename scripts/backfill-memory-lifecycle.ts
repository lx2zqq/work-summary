import "./load-env";

import { desc, eq } from "drizzle-orm";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { createClient, extractJson, getAiModelName } from "@/lib/ai/deepseek";
import { getDb } from "@/lib/db/client";
import { memories } from "@/lib/db/schema";
import {
  MEMORY_ARCHIVE_GRACE_DAYS,
  type MemoryLifecycle,
} from "@/lib/types";

/**
 * 存量记忆生命周期回填。
 * 默认 dry-run，只打印建议；显式传 --apply 才写库。
 * 过时记忆只推进到 pending_archive，保留 5 天宽限期由用户在复盘页把关。
 */

const BATCH_SIZE = 20;
const DEFAULT_LIMIT = 1000;
const MAX_REASON_CHARS = 30;
const RAW_PREVIEW_CHARS = 600;
const DAY_MS = 24 * 60 * 60 * 1000;

type MemoryRow = typeof memories.$inferSelect;

type Classification = {
  id: string;
  lifecycle: MemoryLifecycle;
  reason: string;
};

const CLASSIFY_RULES = `你是学管部长期记忆的分类助手。请判断每条记忆是长期有效还是阶段性有效。

【permanent 长期】
- 学生的性格、学习习惯、薄弱学科规律、家长长期沟通偏好
- 校区流程/规定、固定工作规范、长期目标
- 以后写复盘时还会反复参考的事实

【ephemeral 阶段性】
- 本周待办、某次具体考试/活动/补课安排
- 临时请假、单次跟进事项、有明确结束时间的安排
- 只在几天或一两周内有效的状态

【要求】
- 逐条给出 id 和 lifecycle，reason 用不超过 30 个汉字说明理由
- 不确定时选择 permanent，避免误归档长期信息
- 只输出 JSON，不要解释：{"items":[{"id":"...","lifecycle":"permanent","reason":"..."}]}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readLimit(): number {
  const prefix = "--limit=";
  const arg = process.argv.find((value) => value.startsWith(prefix));
  if (!arg) return DEFAULT_LIMIT;

  const parsed = Number(arg.slice(prefix.length));
  return Number.isFinite(parsed) && parsed > 0
    ? Math.trunc(parsed)
    : DEFAULT_LIMIT;
}

function clampReason(value: unknown): string {
  if (typeof value !== "string") return "模型未给出原因";

  const chars = Array.from(value.trim());
  if (chars.length === 0) return "模型未给出原因";

  return chars.length > MAX_REASON_CHARS
    ? chars.slice(0, MAX_REASON_CHARS).join("")
    : chars.join("");
}

function parseClassifications(
  raw: string,
  allowedIds: Set<string>,
): Classification[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(extractJson(raw.trim()));
  } catch {
    return [];
  }

  const items = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.items)
      ? parsed.items
      : [];

  const result: Classification[] = [];

  for (const item of items) {
    if (!isRecord(item)) continue;

    const id = typeof item.id === "string" ? item.id : "";
    if (!allowedIds.has(id)) continue;

    const lifecycle =
      item.lifecycle === "ephemeral" ? "ephemeral" : "permanent";

    result.push({
      id,
      lifecycle,
      reason: clampReason(item.reason),
    });
  }

  return result;
}

function previewRaw(raw: string): string {
  const compact = raw.replace(/\s+/g, " ").trim();
  if (!compact) return "（空输出）";

  const chars = Array.from(compact);
  return chars.length > RAW_PREVIEW_CHARS
    ? `${chars.slice(0, RAW_PREVIEW_CHARS).join("")}…`
    : compact;
}

type BatchResponse = {
  classifications: Classification[];
  raw: string;
  finishReason: string | null;
  reasoningChars: number;
  completionTokens: number;
};

async function requestBatch(
  client: OpenAI,
  model: string,
  messages: ChatCompletionMessageParam[],
  allowedIds: Set<string>,
): Promise<BatchResponse> {
  const completion = await client.chat.completions.create({
    model,
    messages,
    temperature: 0.1,
    max_tokens: 4000,
    response_format: { type: "json_object" },
    // deepseek-flash 默认思考强度会吃满 token，正文被挤成空字符串
    reasoning_effort: "low",
  });

  const message = completion.choices[0]?.message;
  const raw = message?.content?.trim() ?? "";
  const reasoning = (
    message as { reasoning_content?: unknown } | undefined
  )?.reasoning_content;

  return {
    classifications: parseClassifications(raw, allowedIds),
    raw,
    finishReason: completion.choices[0]?.finish_reason ?? null,
    reasoningChars:
      typeof reasoning === "string" ? Array.from(reasoning).length : 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
  };
}

async function classifyBatch(
  client: OpenAI,
  model: string,
  rows: MemoryRow[],
): Promise<Classification[]> {
  const lines = rows.map((row) => {
    const who =
      row.scope === "student" ? row.studentName || "学生" : "通用";
    const updated = row.updatedAt.toISOString().slice(0, 10);

    return `- id=${row.id} | [${who}] | ${row.category} | ${row.content} | 更新于 ${updated}`;
  });

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: CLASSIFY_RULES },
    { role: "user", content: lines.join("\n") },
  ];
  const allowedIds = new Set(rows.map((row) => row.id));

  const first = await requestBatch(client, model, messages, allowedIds);
  if (first.classifications.length > 0) return first.classifications;

  console.warn(
    `[batch] 首次分类输出不可用（finish_reason=${first.finishReason ?? "unknown"}，completion_tokens=${first.completionTokens}，reasoning=${first.reasoningChars} 字），自动重试一次`,
  );
  console.warn("[batch] 原始输出预览：", previewRaw(first.raw));

  const retry = await requestBatch(
    client,
    model,
    [
      ...messages,
      { role: "assistant", content: first.raw || "（空输出）" },
      {
        role: "user",
        content:
          '上面的输出不能使用：没有解析到有效分类。请只输出 {"items":[{"id":"...","lifecycle":"permanent|ephemeral","reason":"..."}]} 格式的完整 JSON，id 必须来自输入，不要输出解释或 Markdown。',
      },
    ],
    allowedIds,
  );

  if (retry.classifications.length > 0) return retry.classifications;

  console.error(
    `[batch] 两次分类均失败（finish_reason=${retry.finishReason ?? "unknown"}，completion_tokens=${retry.completionTokens}，reasoning=${retry.reasoningChars} 字），最后一次输出预览：`,
    previewRaw(retry.raw),
  );
  throw new Error("模型没有返回可用的分类结果");
}

async function applyEphemeral(
  row: MemoryRow,
  now: Date,
): Promise<void> {
  await getDb()
    .update(memories)
    .set({
      lifecycle: "ephemeral",
      status: "pending_archive",
      expiresAt: now,
      archiveAfter: new Date(
        now.getTime() + MEMORY_ARCHIVE_GRACE_DAYS * DAY_MS,
      ),
      archiveReason: "已过建议时效",
      updatedAt: now,
    })
    .where(eq(memories.id, row.id));
}

function formatLine(
  row: MemoryRow,
  classification: Classification,
): string {
  const who =
    row.scope === "student" ? row.studentName || "学生" : "通用";
  return `- ${who} | ${row.category} | ${row.content} | 建议=${classification.lifecycle} | ${classification.reason}`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const limit = readLimit();

  const client = createClient();
  const model = getAiModelName();

  const rows = await getDb()
    .select()
    .from(memories)
    .where(eq(memories.status, "active"))
    .orderBy(desc(memories.updatedAt))
    .limit(limit);

  console.log(
    apply
      ? `[apply] 共 ${rows.length} 条活跃记忆，将分批 ${BATCH_SIZE} 条调用模型。`
      : `[dry-run] 共 ${rows.length} 条活跃记忆，只打印建议，不写数据库。`,
  );
  console.log("提示：确认分类结果后加 --apply 才会写库。\n");

  if (apply) {
    console.log(
      "注意：apply 会重新调用模型分类，结果可能与刚才 dry-run 的建议略有差异。\n",
    );
  }

  const now = new Date();
  let permanentCount = 0;
  let ephemeralCount = 0;
  let failedBatches = 0;

  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const batch = rows.slice(offset, offset + BATCH_SIZE);
    let classifications: Classification[];

    try {
      classifications = await classifyBatch(client, model, batch);
    } catch (error) {
      failedBatches += 1;
      console.error(
        `[batch ${Math.floor(offset / BATCH_SIZE) + 1}] 分类失败：`,
        error instanceof Error ? error.message : error,
      );
      continue;
    }

    const byId = new Map(
      classifications.map((item) => [item.id, item]),
    );

    for (const row of batch) {
      const classification = byId.get(row.id);

      // 模型漏掉的条目按长期处理，保持原状最安全
      if (!classification) {
        permanentCount += 1;
        console.log(`- ${formatLine(row, {
          id: row.id,
          lifecycle: "permanent",
          reason: "模型未返回，按长期保留",
        })}`);
        continue;
      }

      if (classification.lifecycle === "ephemeral") {
        ephemeralCount += 1;
        console.log(`- ${formatLine(row, classification)}`);

        if (apply) {
          await applyEphemeral(row, now);
        }
      } else {
        permanentCount += 1;
        console.log(`- ${formatLine(row, classification)}`);
      }
    }
  }

  console.log(
    `\n完成：长期 ${permanentCount} 条，阶段性 ${ephemeralCount} 条，失败 ${failedBatches} 批。`,
  );

  if (apply && ephemeralCount > 0) {
    console.log(
      `阶段性记忆已进入待归档状态，宽限期 ${MEMORY_ARCHIVE_GRACE_DAYS} 天；可在复盘页或记忆页选择保留。`,
    );
  }

  if (failedBatches > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("存量记忆分类失败：", error);
  process.exit(1);
});
