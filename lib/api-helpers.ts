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
