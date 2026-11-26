import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/request-origin";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "请求来源不正确" }, { status: 403 });
  }

  try {
    await clearSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[auth:logout]", error);
    return NextResponse.json(
      { error: "退出登录失败，请稍后重试" },
      { status: 500 },
    );
  }
}
