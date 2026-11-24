import { NextResponse } from "next/server";
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

    const result = await polishCustomPhrase({
      text: parsed.data.text,
      existing: collectExistingPhrases(
        Object.values(DAILY_PHRASES).flat(),
        settings.customPhrases,
      ),
      studentNames: students.map((student) => student.name),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[phrases:preview]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "润色失败" },
      { status: 422 },
    );
  }
}
