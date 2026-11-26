import { NextResponse } from "next/server";
import {
  buildCustomPhrase,
  canAddMorePhrases,
  collectExistingPhrases,
  validateCustomPhrase,
} from "@/lib/ai/phrase";
import { DAILY_PHRASES } from "@/lib/daily-phrase";
import { firstIssue, requireApiSession } from "@/lib/api-helpers";
import { listStudents, mutateCustomPhrases } from "@/lib/db/queries";
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
    const students = await listStudents();
    const phrase = buildCustomPhrase(parsed.data);

    // 读取和写入放在同一个事务里，避免并发添加时后一次覆盖前一次
    const result = await mutateCustomPhrases((current) => {
      if (!canAddMorePhrases(current)) {
        return { error: `最多保存 ${MAX_CUSTOM_PHRASES} 条，先删掉几条再加` };
      }

      // 前端已经校验过，这里再校验一次，防止绕过预览接口直接写入
      const issues = validateCustomPhrase({
        phrase: parsed.data.phrase,
        existing: collectExistingPhrases(
          Object.values(DAILY_PHRASES).flat(),
          current,
        ),
        studentNames: students.map((student) => student.name),
      });

      if (issues.length > 0) {
        return { error: issues.join("；") };
      }

      return { next: [...current, phrase] };
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    return NextResponse.json(
      { phrase, phrases: result.phrases },
      { status: 201 },
    );
  } catch (error) {
    console.error("[phrases:add]", error);
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}
