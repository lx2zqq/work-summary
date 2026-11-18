import { NextResponse } from "next/server";
import {
  buildCustomPhrase,
  canAddMorePhrases,
  collectExistingPhrases,
  validateCustomPhrase,
} from "@/lib/ai/phrase";
import { DAILY_PHRASES } from "@/lib/daily-phrase";
import { firstIssue, requireApiSession } from "@/lib/api-helpers";
import { getSettings, listStudents, updateSettings } from "@/lib/db/queries";
import { addPhraseSchema } from "@/lib/schema";
import { MAX_CUSTOM_PHRASES } from "@/lib/types";

/** 用户确认后把润色结果写进话术库 */
export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const parsed = addPhraseSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: firstIssue(parsed.error) },
      { status: 400 },
    );
  }

  try {
    const settings = await getSettings();

    if (!canAddMorePhrases(settings.customPhrases)) {
      return NextResponse.json(
        { error: `最多保存 ${MAX_CUSTOM_PHRASES} 条，先删掉几条再加` },
        { status: 400 },
      );
    }

    const students = await listStudents();
    // 前端已经校验过，这里再校验一次，防止绕过预览接口直接写入
    const issues = validateCustomPhrase({
      phrase: parsed.data.phrase,
      existing: collectExistingPhrases(
        Object.values(DAILY_PHRASES).flat(),
        settings.customPhrases,
      ),
      studentNames: students.map((student) => student.name),
    });

    if (issues.length > 0) {
      return NextResponse.json(
        { error: issues.join("；") },
        { status: 400 },
      );
    }

    const phrase = buildCustomPhrase(parsed.data);
    const next = [...settings.customPhrases, phrase];
    const saved = await updateSettings({ customPhrases: next });

    return NextResponse.json({ phrase, phrases: saved.customPhrases });
  } catch (error) {
    console.error("[phrases:add]", error);
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}
