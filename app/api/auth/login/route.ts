import { NextResponse } from "next/server";
import {
  createSession,
  getAuthConfigError,
  verifyPassword,
} from "@/lib/auth";
import {
  checkLoginRateLimit,
  getClientId,
  resetLoginRateLimit,
} from "@/lib/rate-limit";
import { loginSchema } from "@/lib/schema";

export async function POST(request: Request) {
  const configError = getAuthConfigError();
  if (configError) {
    // 配置细节只写服务端日志，不把环境变量名返回给客户端
    console.error("[auth:login] 配置不完整：", configError);
    return NextResponse.json(
      { error: "服务暂时不可用，请稍后重试" },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "请输入密码" }, { status: 400 });
  }

  const key = getClientId(request);
  const limit = checkLoginRateLimit(key);
  if (!limit.allowed) {
    const minutes = Math.max(1, Math.ceil(limit.retryAfter / 60));
    return NextResponse.json(
      { error: `尝试次数太多，请 ${minutes} 分钟后再试` },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfter) },
      },
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
      { error: "登录失败，请稍后重试" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
