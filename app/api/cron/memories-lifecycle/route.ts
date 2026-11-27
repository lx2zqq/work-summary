import { NextResponse } from "next/server";
import { syncMemoryLifecycle } from "@/lib/db/queries";

/**
 * 可选的定时入口。
 * 不配置也不会影响主流程：列表和生成读取时会惰性推进。
 */
function readSecret(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.replace(/^Bearer\s+/i, "").trim();

  return bearer || request.headers.get("x-cron-secret")?.trim() || "";
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret) {
    return NextResponse.json(
      { error: "未配置 CRON_SECRET，定时接口未启用" },
      { status: 503 },
    );
  }

  if (readSecret(request) !== secret) {
    return NextResponse.json({ error: "密钥不正确" }, { status: 401 });
  }

  try {
    const result = await syncMemoryLifecycle();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron:memories-lifecycle]", error);
    return NextResponse.json({ error: "执行失败" }, { status: 500 });
  }
}
