import { NextResponse } from "next/server";
import {
  AiError,
  generateDraftWithUsage,
  getAiErrorMessage,
  isAiConfigured,
  resolveToolsMode,
} from "@/lib/ai/deepseek";
import { isAbortError } from "@/lib/ai/errors";
import type { EventProperties } from "@/lib/analytics/events";
import { trackEvent } from "@/lib/analytics/events";
import type { PromptContext } from "@/lib/ai/prompt";
import {
  diffSections,
  parseStreamState,
  type SectionStreamEntry,
} from "@/lib/ai/stream-parser";
import { encodeSSE } from "@/lib/sse";
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

/**
 * 流式生成：边生成边把已完成的条目推给前端。
 * 只在 final 模式启用，追问和改文风的输出太短，流式没有意义。
 */
function streamGenerate(input: {
  context: PromptContext;
  input: GenerateRequest;
  startedAt: number;
  baseProperties: EventProperties;
  requestSignal: AbortSignal;
  loadFallbackContext?: ContextBundle["loadFallbackContext"];
}): Response {
  const {
    context,
    input: request,
    startedAt,
    baseProperties,
    requestSignal,
    loadFallbackContext,
  } = input;
  const encoder = new TextEncoder();
  const abortController = new AbortController();
  let closed = false;

  // 客户端断开或读取端取消时，立刻中止模型请求，避免白烧 token
  const handleAbort = () => {
    closed = true;
    abortController.abort();
  };

  requestSignal.addEventListener("abort", handleAbort, { once: true });
  if (requestSignal.aborted) handleAbort();

  const stream = new ReadableStream<Uint8Array>({
    // 不要在 start 里 await 整段生成：框架会在 start 的 Promise
    // 长时间不 resolve 时提前关掉 controller，后续 enqueue 直接抛错
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;

        try {
          controller.enqueue(encoder.encode(encodeSSE(event, data)));
        } catch {
          // 写入失败说明连接已经断开，顺手停掉模型请求
          handleAbort();
        }
      };

      void (async () => {
      try {
        send("status", { message: "正在查询资料…" });

        let buffer = "";
        // 保存的是「最新完整状态」，diff 才有正确的比对基准
        let latest: SectionStreamEntry[] = [];
        let lastPartial = "";
        let lastPartialAt = 0;

        const result = await generateDraftWithUsage(context, {
          toolDeps: buildToolDeps(context.settings),
          loadFallbackContext,
          signal: abortController.signal,
          onContent: (chunk) => {
            buffer += chunk;
            const state = parseStreamState(buffer);

            const diff = diffSections(latest, state.sections);
            latest = state.sections;

            for (const entry of diff) send("section", entry);

            // 正在写的那一句单独推，前端才有逐字效果；40ms 节流避免刷屏
            if (state.partial && state.partial.text !== lastPartial) {
              const now = Date.now();
              if (now - lastPartialAt >= 40) {
                lastPartial = state.partial.text;
                lastPartialAt = now;
                send("partial", state.partial);
              }
            }
          },
        });

        await trackEvent({
          event: "generate_finished",
          reviewDate: request.date,
          properties: {
            ...baseProperties,
            durationMs: Date.now() - startedAt,
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            retried: result.usage.retried,
            fallback: false,
            questionCount: result.draft.questions.length,
            itemCount: countDraftItems(result.draft),
            charCount: countDraftChars(result.draft),
            toolCallCount: result.toolCallNames.length,
            toolRounds: result.toolRounds,
            degraded: result.degraded,
            usedMemoryCount: result.memories.length,
          },
        });

        send("done", {
          draft: result.draft,
          memories: result.memories,
          fallback: false,
        });
      } catch (error) {
        // 客户端主动断开：不记失败埋点，也不写错误事件，静默关闭
        if (isAbortError(error, abortController.signal)) {
          console.info("[generate:stream] 客户端已断开，已中止生成");
          return;
        }

        console.error("[generate:stream]", error);

        await trackEvent({
          event: "generate_failed",
          reviewDate: request.date,
          properties: {
            ...baseProperties,
            durationMs: Date.now() - startedAt,
            errorKind: error instanceof AiError ? error.kind : "request",
          },
        });

        send("error", { message: getAiErrorMessage(error) });
      } finally {
        closed = true;
        requestSignal.removeEventListener("abort", handleAbort);
        try {
          controller.close();
        } catch {
          // 已经关闭时忽略
        }
      }
      })();
    },
    // 下游取消读取（例如前端 abort 或页面关闭）时同样中止生成
    cancel() {
      handleAbort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
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
      { error: "数据库还没准备好，请先运行 npm run db:migrate" },
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
      warning:
        "服务端还没有配置 REVIEW_DEEPSEEK_API_KEY，已按原文生成草稿；配置后会自动使用 AI 整理。",
      memories: context.memories,
    });
  }

  if (input.stream && input.mode === "final") {
    return streamGenerate({
      context,
      input,
      startedAt,
      baseProperties,
      requestSignal: request.signal,
      loadFallbackContext,
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
