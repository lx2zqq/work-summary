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

  /**
   * 腾出一个位置。返回 false 表示一个都不该删。
   * 只淘汰计数最低且尚未封禁的桶；如果所有桶都在封禁中，
   * 宁可这次不建桶，也不能把正在限流的高计数 IP 提前放出来。
   */
  const makeRoom = (now: number): boolean => {
    if (buckets.size < maxEntries) return true;

    sweep(now);
    if (buckets.size < maxEntries) return true;

    let lowestKey: string | null = null;
    let lowestCount = Number.POSITIVE_INFINITY;

    for (const [key, bucket] of buckets) {
      if (bucket.count < lowestCount) {
        lowestCount = bucket.count;
        lowestKey = key;
      }
    }

    if (lowestKey !== null && lowestCount < maxAttempts) {
      buckets.delete(lowestKey);
      return true;
    }

    return false;
  };

  function check(key: string): RateLimitResult {
    const now = Date.now();

    if (now >= nextSweepAt) sweep(now);

    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      if (bucket) buckets.delete(key);

      // 表满且全是封禁中的桶：本次放行但不建桶，
      // 宁可少限流一个新 IP，也不提前解封正在被限流的 IP
      if (!makeRoom(now)) return { allowed: true, retryAfter: 0 };

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

/** 消耗模型额度或公开接口的限流窗口 */
const AI_WINDOW_MS = 5 * 60 * 1000;
const DEMO_WINDOW_MS = 10 * 60 * 1000;

export type AiRateLimitScope =
  | "generate"
  | "transcribe"
  | "memoryExtract"
  | "phrasePreview"
  | "weeklyGenerate"
  | "demoWeeklyExport";

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
  weeklyGenerate: createRateLimiter({
    windowMs: AI_WINDOW_MS,
    maxAttempts: 8,
  }),
  // 公开演示接口不登录，限流更保守
  demoWeeklyExport: createRateLimiter({
    windowMs: DEMO_WINDOW_MS,
    maxAttempts: 20,
  }),
};

/**
 * 取客户端 IP，用于登录和 AI 接口限流。
 *
 * 部署在 Nginx 反向代理后时，需要配置：
 *   proxy_set_header X-Real-IP $remote_addr;
 *   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
 *
 * 优先 x-real-ip（反代用 $remote_addr 覆盖写入，客户端无法伪造）；
 * 没有时取 x-forwarded-for 最右侧一跳，即最近一层代理追加的地址，
 * 左侧可以被客户端随意伪造，不能直接取第一项。
 */
export function getClientId(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = request.headers.get("x-forwarded-for");
  const forwardedIps = forwarded
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const forwardedIp = forwardedIps?.[forwardedIps.length - 1];
  if (forwardedIp) return forwardedIp;

  return "unknown";
}

/** AI 计费接口按客户端 IP 计数 */
export function checkAiRateLimit(
  request: Request,
  scope: AiRateLimitScope,
): RateLimitResult {
  return aiLimiters[scope].check(getClientId(request));
}
