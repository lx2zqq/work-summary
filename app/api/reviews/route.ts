import { NextResponse } from "next/server";
import { firstIssue, requireApiSession } from "@/lib/api-helpers";
import { isValidISODate } from "@/lib/date";
import {
  getReviewByDate,
  getSettings,
  listReviews,
  saveReview,
} from "@/lib/db/queries";
import { normalizeDraft } from "@/lib/draft";
import { saveReviewSchema } from "@/lib/schema";
import { renderReview } from "@/lib/template";
import { hasDraftContent } from "@/lib/types";

export async function GET(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  try {
    if (date) {
      if (!isValidISODate(date)) {
        return NextResponse.json({ error: "日期格式不对" }, { status: 400 });
      }
      const review = await getReviewByDate(date);
      return NextResponse.json({ review });
    }

    const rawLimit = Number(searchParams.get("limit") ?? 50);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100)
      : 50;

    const reviews = await listReviews(limit);
    return NextResponse.json({ reviews });
  } catch (error) {
    console.error("[reviews:GET]", error);
    return NextResponse.json(
      { error: "读取历史失败，请检查数据库是否已初始化" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const parsed = saveReviewSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: firstIssue(parsed.error) },
      { status: 400 },
    );
  }

  const input = parsed.data;
  if (!isValidISODate(input.date)) {
    return NextResponse.json({ error: "日期格式不对" }, { status: 400 });
  }

  try {
    const settings = await getSettings();
    const draft = normalizeDraft(input.draft);
    // 还在追问阶段或没有正文时，不生成最终文本，避免历史里出现半成品
    const finalText =
      draft.questions.length === 0 && hasDraftContent(draft)
        ? renderReview(draft, input.date, settings)
        : "";

    const review = await saveReview({
      date: input.date,
      rawInput: input.rawInput,
      draft,
      finalText,
      style: input.style,
      conversation: input.conversation,
      round: input.round,
    });

    return NextResponse.json({ review, finalText });
  } catch (error) {
    console.error("[reviews:POST]", error);
    return NextResponse.json(
      { error: "保存失败，请检查数据库连接" },
      { status: 500 },
    );
  }
}
