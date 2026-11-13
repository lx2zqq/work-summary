import { NextResponse } from "next/server";
import {
  createSession,
  getAuthConfigError,
  verifyPassword,
} from "@/lib/auth";
import {
  checkLoginRateLimit,
  resetLoginRateLimit,
} from "@/lib/rate-limit";
import { loginSchema } from "@/lib/schema";

export async function POST(request: Request) {
  const configError = getAuthConfigError();
  if (configError) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "请输入密码" }, { status: 400 });
  }

  const key = getClientKey(request);
  const limit = checkLoginRateLimit(key);
  if (!limit.allowed) {
    const minutes = Math.max(1, Math.ceil(limit.retryAfter / 60));
    return NextResponse.json(
      { error: `尝试次数太多，请 ${minutes} 分钟后再试` },
      { status: 429 },
    );
  }

  if (!verifyPassword(parsed.data.password)) {
    await new Promise<void>((resolve) => setTimeout(resolve, 350));
    return NextResponse.json({ error: "密码不对，再试一次" }, { status: 401 });
  }

  resetLoginRateLimit(key);

  try {
    await createSession();
  } catch (error) {
    console.error("[auth:login]", error);
    return NextResponse.json(
      { error: "创建登录态失败，请检查 AUTH_SECRET" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

function getClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "local";
}
