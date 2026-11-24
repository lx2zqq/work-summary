import { NextResponse } from "next/server";
import { isValidUuid, requireApiSession } from "@/lib/api-helpers";
import { deleteReview } from "@/lib/db/queries";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "复盘 ID 不对" }, { status: 400 });
  }

  try {
    const deleted = await deleteReview(id);

    if (!deleted) {
      return NextResponse.json(
        { error: "这篇复盘不存在，可能已经被删除" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[reviews:DELETE]", error);
    return NextResponse.json(
      { error: "删除失败，请检查数据库连接" },
      { status: 500 },
    );
  }
}
