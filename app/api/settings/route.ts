import { NextResponse } from "next/server";
import { firstIssue, requireApiSession } from "@/lib/api-helpers";
import { getSettings, updateSettings } from "@/lib/db/queries";
import { settingsPatchSchema } from "@/lib/schema";

export async function GET() {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  try {
    const settings = await getSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("[settings:GET]", error);
    return NextResponse.json(
      { error: "读取设置失败，请稍后重试" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const parsed = settingsPatchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: firstIssue(parsed.error) },
      { status: 400 },
    );
  }

  try {
    const settings = await updateSettings(parsed.data);
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("[settings:PATCH]", error);
    return NextResponse.json({ error: "保存设置失败" }, { status: 500 });
  }
}
