import { NextResponse } from "next/server";
import {
  AiError,
  generateDraftWithUsage,
  getAiErrorMessage,
  isAiConfigured,
  resolveToolsMode,
} from "@/lib/ai/deepseek";
import { isAbortError } from "@/lib/ai/errors";
import { trackEvent } from "@/lib/analytics/events";
import type { PromptContext } from "@/lib/ai/prompt";
import type { ToolDeps } from "@/lib/ai/tools";
import {
  firstIssue,
  rateLimitExceeded,
  requireApiSession,
} from "@/lib/api-helpers";
import { checkAiRateLimit } from "@/lib/rate-limit";
import {
  findMemories,
  findReviews,
  findStudents,
  getRecentReviews,
  getSettings,
  listActiveMemories,
  listStudents,
} from "@/lib/db/queries";
import {
  countDraftChars,
  countDraftItems,
  fallbackDraft,
  normalizeDraft,
} from "@/lib/draft";
import { selectMemoriesForPrompt } from "@/lib/memory";
import {
  generateRequestSchema,
  type GenerateRequest,
} from "@/lib/schema";

export const maxDuration = 60;

type PreInjectedContext = Pick<
  PromptContext,
  "students" | "memories" | "recentReviews"
>;

type ContextBundle = {
  context: PromptContext;
  /** 仅工具懒加载模式返回：模型不支持工具时再补查一次 */
  loadFallbackContext?: () => Promise<PreInjectedContext>;
};

/** 串行读取，避免 Supabase 连接池在并发查询时卡住 */
async function loadPreInjectedContext(
  input: GenerateRequest,
  settings: PromptContext["settings"],
): Promise<PreInjectedContext> {
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

  return { students, memories, recentReviews };
}

async function buildContext(
  input: GenerateRequest,
  toolsEnabled: boolean,
): Promise<ContextBundle> {
  const settings = await getSettings();

  const context: PromptContext = {
    mode: input.mode,
    reviewDate: input.date,
    style: input.style,
    settings,
    students: [],
    recentReviews: [],
    memories: [],
    rawInput: input.rawInput,
    answers: input.answers,
    // 上一轮的追问只是 UI 状态，不进入模型上下文，避免模型重复或误判
    currentDraft: input.currentDraft
      ? { ...normalizeDraft(input.currentDraft), questions: [] }
      : undefined,
    round: input.round,
    toolsEnabled,
  };

  // 工具模式下这些数据不再进 prompt：只在模型不支持工具时补查，省掉生成前的串行查库
  if (toolsEnabled && input.mode !== "restyle" && isAiConfigured()) {
    return {
      context,
      loadFallbackContext: () => loadPreInjectedContext(input, settings),
    };
  }

  return {
    context: {
      ...context,
      ...(await loadPreInjectedContext(input, settings)),
    },
  };
}

/** 工具执行依赖：全部只读，且都受设置开关控制 */
function buildToolDeps(settings: PromptContext["settings"]): ToolDeps {
  return {
    searchStudents: (input) =>
      findStudents({
        query: input.query,
        status: input.status,
        grade: input.grade,
        limit: 20,
      }),
    searchMemories: (input) =>
      settings.enableMemory
        ? findMemories({
            studentName: input.studentName,
            keyword: input.keyword,
            scope: input.scope,
            limit: input.limit ?? 8,
          })
        : Promise.resolve([]),
    searchReviews: (input) =>
      findReviews({
        keyword: input.keyword,
        beforeDate: input.beforeDate,
        afterDate: input.afterDate,
        limit: input.limit ?? 2,
      }),
  };
}

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const limit = checkAiRateLimit(request, "generate");
  if (!limit.allowed) return rateLimitExceeded(limit.retryAfter);

  const body = await request.json().catch(() => null);
  const parsed = generateRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: firstIssue(parsed.error) },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const toolsMode = resolveToolsMode();
  let bundle: ContextBundle;

  try {
    bundle = await buildContext(input, toolsMode === "auto");
  } catch (error) {
    console.error("[generate:db]", error);
    return NextResponse.json(
      { error: "服务暂时不可用，请稍后重试" },
      { status: 500 },
    );
  }

  const { context, loadFallbackContext } = bundle;

  const startedAt = Date.now();
  const baseProperties = {
    mode: input.mode,
    style: input.style,
    round: input.round,
  };

  await trackEvent({
    event: "generate_started",
    reviewDate: input.date,
    properties: {
      ...baseProperties,
      inputCharCount: input.rawInput.length,
      answerCount: input.answers.length,
      memoryCount: context.memories.length,
    },
  });

  if (!isAiConfigured()) {
    const draft = fallbackDraft(input.rawInput);
    await trackEvent({
      event: "generate_finished",
      reviewDate: input.date,
      properties: {
        ...baseProperties,
        durationMs: Date.now() - startedAt,
        retried: false,
        fallback: true,
        questionCount: draft.questions.length,
        itemCount: countDraftItems(draft),
        charCount: countDraftChars(draft),
      },
    });

    return NextResponse.json({
      draft,
      fallback: true,
      warning: "AI 服务暂时不可用，已按原文生成草稿，请手动调整。",
      memories: context.memories,
    });
  }

  try {
    const { draft, usage, toolCallNames, toolRounds, degraded, memories } =
      await generateDraftWithUsage(context, {
        toolDeps: buildToolDeps(context.settings),
        loadFallbackContext,
        signal: request.signal,
      });

    await trackEvent({
      event: "generate_finished",
      reviewDate: input.date,
      properties: {
        ...baseProperties,
        durationMs: Date.now() - startedAt,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        retried: usage.retried,
        fallback: false,
        questionCount: draft.questions.length,
        itemCount: countDraftItems(draft),
        charCount: countDraftChars(draft),
        toolCallCount: toolCallNames.length,
        toolRounds,
        degraded,
        usedMemoryCount: memories.length,
      },
    });

    return NextResponse.json({ draft, memories });
  } catch (error) {
    // 客户端已断开：不记失败埋点、不打错误堆栈，直接结束
    if (isAbortError(error, request.signal)) {
      console.info("[generate:ai] 客户端已断开，已中止生成");
      return NextResponse.json({ error: "请求已取消" }, { status: 499 });
    }

    console.error("[generate:ai]", error);

    await trackEvent({
      event: "generate_failed",
      reviewDate: input.date,
      properties: {
        ...baseProperties,
        durationMs: Date.now() - startedAt,
        errorKind: error instanceof AiError ? error.kind : "request",
      },
    });

    return NextResponse.json({
      draft: fallbackDraft(input.rawInput),
      fallback: true,
      warning: `${getAiErrorMessage(error)}。已按原文生成草稿，请手动调整。`,
      memories: [],
    });
  }
}
