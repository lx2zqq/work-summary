/** 默认最多保留 1 万个 key，防止 Map 被大量请求无限撑大 */
const DEFAULT_MAX_ENTRIES = 10_000;

export type RateLimitConfig = {
  windowMs: number;
  maxAttempts: number;
  /** 桶数量上限，超出后先清过期项，再淘汰最早条目 */
  maxEntries?: number;
};

export type RateLimitResult = {
  allowed: boolean;
  /** 距离窗口重置的秒数，仅超限时有意义 */
  retryAfter: number;
};

export type RateLimiter = {
  check: (key: string) => RateLimitResult;
  reset: (key: string) => void;
};

type Bucket = {
  count: number;
  resetAt: number;
};

/**
 * 内存限流器。
 * 按窗口惰性清理过期条目；到达容量上限时先清过期项，再淘汰最早插入的 key。
 */
export function createRateLimiter({
  windowMs,
  maxAttempts,
  maxEntries = DEFAULT_MAX_ENTRIES,
}: RateLimitConfig): RateLimiter {
  const buckets = new Map<string, Bucket>();
  let nextSweepAt = 0;

  const sweep = (now: number) => {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
    nextSweepAt = now + windowMs;
  };

  const makeRoom = (now: number) => {
    if (buckets.size < maxEntries) return;

    sweep(now);

    while (buckets.size >= maxEntries) {
      const oldest = buckets.keys().next();
      if (oldest.done) break;
      buckets.delete(oldest.value);
    }
  };

  function check(key: string): RateLimitResult {
    const now = Date.now();

    if (now >= nextSweepAt) sweep(now);

    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      if (bucket) buckets.delete(key);
      makeRoom(now);
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfter: 0 };
    }

    if (bucket.count >= maxAttempts) {
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      };
    }

    bucket.count += 1;
    return { allowed: true, retryAfter: 0 };
  }

  function reset(key: string): void {
    buckets.delete(key);
  }

  return { check, reset };
}

const loginLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxAttempts: 6,
});

export function checkLoginRateLimit(key: string): RateLimitResult {
  return loginLimiter.check(key);
}

export function resetLoginRateLimit(key: string): void {
  loginLimiter.reset(key);
}

/** AI 计费接口的限流窗口 */
const AI_WINDOW_MS = 5 * 60 * 1000;

export type AiRateLimitScope =
  | "generate"
  | "transcribe"
  | "memoryExtract"
  | "phrasePreview";

// 各接口独立计数，避免追问/成稿频率互相挤占额度
const aiLimiters: Record<AiRateLimitScope, RateLimiter> = {
  generate: createRateLimiter({
    windowMs: AI_WINDOW_MS,
    maxAttempts: 20,
  }),
  transcribe: createRateLimiter({
    windowMs: AI_WINDOW_MS,
    maxAttempts: 20,
  }),
  memoryExtract: createRateLimiter({
    windowMs: AI_WINDOW_MS,
    maxAttempts: 15,
  }),
  phrasePreview: createRateLimiter({
    windowMs: AI_WINDOW_MS,
    maxAttempts: 20,
  }),
};

/** 取客户端标识：Vercel / 反向代理优先，本地开发兜底 unknown */
export function getClientId(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** AI 计费接口按客户端 IP 计数 */
export function checkAiRateLimit(
  request: Request,
  scope: AiRateLimitScope,
): RateLimitResult {
  return aiLimiters[scope].check(getClientId(request));
}
