export type AiErrorKind = "config" | "request" | "output" | "timeout";

export class AiError extends Error {
  constructor(
    message: string,
    public readonly kind: AiErrorKind = "request",
  ) {
    super(message);
    this.name = "AiError";
  }
}

/**
 * 统一判断请求是否被中止。
 * 兼容主动 abort 后的 signal，以及 OpenAI SDK 抛出的 AbortError /
 * APIUserAbortError。
 */
export function isAbortError(
  error: unknown,
  signal?: AbortSignal,
): boolean {
  if (signal?.aborted) return true;
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || error.name === "APIUserAbortError";
}

/** 主动中止时抛出的错误，保持 name 为 AbortError 供上层识别 */
export function createAbortError(): Error {
  const error = new Error("请求已取消");
  error.name = "AbortError";
  return error;
}
