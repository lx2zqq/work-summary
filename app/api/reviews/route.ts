import { NextResponse } from "next/server";
import { trackEvent } from "@/lib/analytics/events";
import { firstIssue, requireApiSession } from "@/lib/api-helpers";
import { isValidISODate } from "@/lib/date";
import {
  getReviewByDate,
  getSettings,
  listReviews,
  saveReview,
} from "@/lib/db/queries";
import {
  countDraftChars,
  countDraftItems,
  normalizeDraft,
} from "@/lib/draft";
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

    const before = searchParams.get("before");
    if (before && !isValidISODate(before)) {
      return NextResponse.json({ error: "日期格式不对" }, { status: 400 });
    }

    const rawLimit = Number(searchParams.get("limit") ?? 50);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100)
      : 50;

    // 多查一条用于判断是否还有更早的复盘，截断后返回
    const rows = await listReviews(limit + 1, before ?? undefined);
    const hasMore = rows.length > limit;
    const reviews = hasMore ? rows.slice(0, limit) : rows;

    return NextResponse.json({ reviews, hasMore });
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

    // 只统计已经有正文的保存，避免自动保存的中间态把数据冲淡
    if (finalText) {
      await trackEvent({
        event: "review_saved",
        reviewDate: input.date,
        properties: {
          style: input.style,
          round: input.round,
          itemCount: countDraftItems(draft),
          charCount: countDraftChars(draft),
        },
      });
    }

    return NextResponse.json({ review, finalText });
  } catch (error) {
    console.error("[reviews:POST]", error);
    return NextResponse.json(
      { error: "保存失败，请检查数据库连接" },
      { status: 500 },
    );
  }
}
