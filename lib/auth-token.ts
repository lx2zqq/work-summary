import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "review_session";
export const SESSION_DAYS = 30;

/** HS256 密钥最短长度，低于这个值容易被暴力破解 */
const MIN_SECRET_BYTES = 32;

export type SessionPayload = {
  role: "owner";
};

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("未配置 AUTH_SECRET，请在环境变量里设置一个随机长字符串");
  }

  const bytes = new TextEncoder().encode(secret);

  if (bytes.length < MIN_SECRET_BYTES) {
    // 生产环境直接拒绝签发和校验，避免弱密钥上线
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `AUTH_SECRET 至少需要 ${MIN_SECRET_BYTES} 字节，请换一个更长的随机字符串`,
      );
    }
    console.warn(
      `[auth] AUTH_SECRET 少于 ${MIN_SECRET_BYTES} 字节，仅开发环境允许`,
    );
  }

  return bytes;
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
