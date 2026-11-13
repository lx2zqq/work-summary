import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "review_session";
export const SESSION_DAYS = 30;

export type SessionPayload = {
  role: "owner";
};

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("未配置 AUTH_SECRET，请在环境变量里设置一个随机长字符串");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: "owner" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecretKey());
}

export async function verifySessionToken(
  token: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });

    if (payload.role !== "owner") return null;
    return { role: "owner" };
  } catch {
    return null;
  }
}
