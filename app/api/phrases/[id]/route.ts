import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-helpers";
import { mutateCustomPhrases } from "@/lib/db/queries";

/** 删除一条自定义话术；内置话术不在库里，删不了 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const { id } = await params;

  if (!id?.trim()) {
    return NextResponse.json({ error: "话术 ID 不对" }, { status: 400 });
  }

  try {
    // 事务内读取最新数组再过滤，避免并发删除时丢失其他更新
    const result = await mutateCustomPhrases((current) => {
      const next = current.filter((item) => item.id !== id);

      if (next.length === current.length) {
        return { error: "这条话术不存在", status: 404 };
      }

      return { next };
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    return NextResponse.json({ phrases: result.phrases });
  } catch (error) {
    console.error("[phrases:delete]", error);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
