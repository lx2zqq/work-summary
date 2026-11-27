import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-helpers";
import {
  listPendingArchiveMemories,
  syncMemoryLifecycle,
} from "@/lib/db/queries";
import { MEMORY_ARCHIVE_GRACE_DAYS } from "@/lib/types";

/** 返回待归档记忆；先做一次惰性流转，保证列表是最新的 */
export async function GET() {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  try {
    await syncMemoryLifecycle();
    const memories = await listPendingArchiveMemories();

    return NextResponse.json({
      memories,
      graceDays: MEMORY_ARCHIVE_GRACE_DAYS,
    });
  } catch (error) {
    console.error("[memories:pending]", error);
    return NextResponse.json(
      { error: "读取待归档记忆失败" },
      { status: 500 },
    );
  }
}
