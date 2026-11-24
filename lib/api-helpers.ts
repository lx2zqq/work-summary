import { NextResponse } from "next/server";
import { getSession } from "./auth";

export async function requireApiSession(): Promise<NextResponse | null> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  return null;
}

export function jsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function firstIssue(error: {
  issues: Array<{ message: string }>;
}): string {
  return error.issues[0]?.message || "请求参数不对";
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 校验路径参数是否为标准 UUID，避免无效 ID 直接打到数据库 */
export function isValidUuid(id: string): boolean {
  return UUID_PATTERN.test(id);
}

/** AI 计费接口触发限流时的统一响应 */
export function rateLimitExceeded(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: "请求太频繁，请稍后再试" },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    },
  );
}
