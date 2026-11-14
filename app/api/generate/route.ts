import { NextResponse } from "next/server";
import {
  generateDraft,
  getAiErrorMessage,
  isAiConfigured,
} from "@/lib/ai/deepseek";
import type { PromptContext } from "@/lib/ai/prompt";
import { firstIssue, requireApiSession } from "@/lib/api-helpers";
import {
  getRecentReviews,
  getSettings,
  listActiveMemories,
  listStudents,
} from "@/lib/db/queries";
import { fallbackDraft, normalizeDraft } from "@/lib/draft";
import { selectMemoriesForPrompt } from "@/lib/memory";
import {
  generateRequestSchema,
  type GenerateRequest,
} from "@/lib/schema";

export const maxDuration = 60;

async function buildContext(input: GenerateRequest): Promise<PromptContext> {
  // 串行读取，避免 Supabase 连接池在并发查询时卡住
  const settings = await getSettings();
  const students = await listStudents();
  const memories =
    settings.enableMemory && input.mode !== "restyle"
      ? selectMemoriesForPrompt(await listActiveMemories(), {
          corpus: [
            input.rawInput,
            ...input.answers.map(
              (pair) => `${pair.question} ${pair.answer}`,
            ),
          ].join("\n"),
          students,
          limit: 40,
        })
      : [];
  const recentReviews =
    input.mode === "final"
      ? await getRecentReviews(input.date, 2)
      : [];

  return {
    mode: input.mode,
    reviewDate: input.date,
    style: input.style,
    settings,
    students,
    recentReviews,
    memories,
    rawInput: input.rawInput,
    answers: input.answers,
    // 上一轮的追问只是 UI 状态，不进入模型上下文，避免模型重复或误判
    currentDraft: input.currentDraft
      ? { ...normalizeDraft(input.currentDraft), questions: [] }
      : undefined,
    round: input.round,
  };
}

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const parsed = generateRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: firstIssue(parsed.error) },
      { status: 400 },
    );
  }

  const input = parsed.data;
  let context: PromptContext | null = null;

  try {
    context = await buildContext(input);
  } catch (error) {
    console.error("[generate:db]", error);
    return NextResponse.json(
      { error: "数据库还没准备好，请先运行 npm run db:migrate" },
      { status: 500 },
    );
  }

  if (!isAiConfigured()) {
    return NextResponse.json({
      draft: fallbackDraft(input.rawInput),
      fallback: true,
      warning:
        "服务端还没有配置 REVIEW_DEEPSEEK_API_KEY，已按原文生成草稿；配置后会自动使用 AI 整理。",
      memories: context.memories,
    });
  }

  try {
    const draft = await generateDraft(context);
    return NextResponse.json({ draft, memories: context.memories });
  } catch (error) {
    console.error("[generate:ai]", error);
    return NextResponse.json({
      draft: fallbackDraft(input.rawInput),
      fallback: true,
      warning: `${getAiErrorMessage(error)}。已按原文生成草稿，请手动调整。`,
      memories: [],
    });
  }
}
