import { NextResponse } from "next/server";
import { AiError } from "@/lib/ai/errors";
import {
  collectExistingPhrases,
  polishCustomPhrase,
} from "@/lib/ai/phrase";
import { DAILY_PHRASES } from "@/lib/daily-phrase";
import {
  firstIssue,
  rateLimitExceeded,
  requireApiSession,
} from "@/lib/api-helpers";
import { checkAiRateLimit } from "@/lib/rate-limit";
import { getSettings, listStudents } from "@/lib/db/queries";
import { phrasePreviewSchema } from "@/lib/schema";

export const maxDuration = 60;

/** 只做润色和校验，不写库；用户确认后再调 POST /api/phrases */
export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const limit = checkAiRateLimit(request, "phrasePreview");
  if (!limit.allowed) return rateLimitExceeded(limit.retryAfter);

  const body = await request.json().catch(() => null);
  const parsed = phrasePreviewSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: firstIssue(parsed.error) },
      { status: 400 },
    );
  }

  try {
    const settings = await getSettings();
    const students = await listStudents();

    const result = await polishCustomPhrase(
      {
        text: parsed.data.text,
        existing: collectExistingPhrases(
          Object.values(DAILY_PHRASES).flat(),
          settings.customPhrases,
        ),
        studentNames: students.map((student) => student.name),
      },
      {
        onUsage: (usage) => {
          console.info(
            `[phrases:preview] tokens: prompt=${usage.promptTokens}, completion=${usage.completionTokens}, retried=${usage.retried}`,
          );
        },
      },
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("[phrases:preview]", error);

    // 校验类错误是给用户看的修改建议，其余原始异常一律不返回
    const message =
      error instanceof AiError && error.kind === "output"
        ? error.message
        : "润色失败，请稍后重试";

    return NextResponse.json({ error: message }, { status: 422 });
  }
}
