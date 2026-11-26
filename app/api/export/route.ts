import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-helpers";
import { todayISO } from "@/lib/date";
import {
  MAX_EXPORT_REVIEWS,
  getReviewStats,
  getSettings,
  listMemories,
  listReviewsForExport,
  listStudents,
} from "@/lib/db/queries";
import { buildBackupMarkdown } from "@/lib/export";

export const maxDuration = 60;

export async function GET(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const rawFormat = new URL(request.url).searchParams.get("format");

  if (rawFormat !== null && rawFormat !== "json" && rawFormat !== "md") {
    return NextResponse.json({ error: "format 参数不对" }, { status: 400 });
  }

  const format = rawFormat === "md" ? "md" : "json";

  try {
    // 串行读取，避免 Supabase 连接池在并发查询时卡住
    const settings = await getSettings();
    const students = await listStudents();
    const memories = await listMemories(1000);
    const stats = await getReviewStats();
    const reviews = await listReviewsForExport();

    // 复盘总数超过单次导出上限时，明确告知调用方数据被截断
    const truncated = stats.total > MAX_EXPORT_REVIEWS;
    const truncationHeaders: Record<string, string> = truncated
      ? { "X-Export-Truncated": "true" }
      : {};

    const exportedAt = new Date().toISOString();
    const filename = `work-summary-${todayISO()}.${format === "md" ? "md" : "json"}`;

    if (format === "md") {
      const body = buildBackupMarkdown({
        exportedAt,
        students,
        memories,
        reviews,
      });

      return new Response(body, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
          ...truncationHeaders,
        },
      });
    }

    const body = JSON.stringify(
      { exportedAt, settings, students, memories, reviews },
      null,
      2,
    );

    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        ...truncationHeaders,
      },
    });
  } catch (error) {
    console.error("[export:GET]", error);
    return NextResponse.json(
      { error: "导出失败，请稍后重试" },
      { status: 500 },
    );
  }
}
