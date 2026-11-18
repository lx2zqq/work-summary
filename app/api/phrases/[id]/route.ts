import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-helpers";
import { getSettings, updateSettings } from "@/lib/db/queries";

/** 删除一条自定义话术；内置话术不在库里，删不了 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const { id } = await params;

  try {
    const settings = await getSettings();
    const next = settings.customPhrases.filter((item) => item.id !== id);

    if (next.length === settings.customPhrases.length) {
      return NextResponse.json({ error: "这条话术不存在" }, { status: 404 });
    }

    const saved = await updateSettings({ customPhrases: next });

    return NextResponse.json({ phrases: saved.customPhrases });
  } catch (error) {
    console.error("[phrases:delete]", error);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
