import { afterEach, describe, expect, it, vi } from "vitest";
import { createRateLimiter, getClientId } from "@/lib/rate-limit";

describe("createRateLimiter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("窗口内未超限时正常放行", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxAttempts: 3 });

    expect(limiter.check("ip")).toEqual({ allowed: true, retryAfter: 0 });
    expect(limiter.check("ip")).toEqual({ allowed: true, retryAfter: 0 });
    expect(limiter.check("ip")).toEqual({ allowed: true, retryAfter: 0 });
  });

  it("超过阈值时拒绝并返回 retryAfter", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const limiter = createRateLimiter({
      windowMs: 60_000,
      maxAttempts: 2,
    });

    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip")).toEqual({
      allowed: false,
      retryAfter: 60,
    });
  });

  it("窗口过期后自动恢复", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const limiter = createRateLimiter({ windowMs: 1_000, maxAttempts: 1 });

    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(false);

    vi.setSystemTime(1_000);
    expect(limiter.check("ip")).toEqual({ allowed: true, retryAfter: 0 });
  });

  it("reset 清空指定 key 的计数", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxAttempts: 1 });

    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);

    limiter.reset("a");
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("超过 maxEntries 时优先淘汰低计数条目", () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      maxAttempts: 3,
      maxEntries: 2,
    });

    // a 已经被刷到封禁，b 只查过一次
    limiter.check("a");
    limiter.check("a");
    limiter.check("a");
    limiter.check("b");

    // 容量满时淘汰计数更低的 b，而不是已封禁的 a
    expect(limiter.check("c").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    // b 被淘汰后重新计数
    expect(limiter.check("b").allowed).toBe(true);
  });

  it("满桶且全部封禁时，新 key 放行但不淘汰封禁桶", () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      maxAttempts: 1,
      maxEntries: 2,
    });

    limiter.check("a");
    limiter.check("a");
    limiter.check("b");
    limiter.check("b");

    // 没有低计数桶可淘汰：新 key 直接放行，但不建桶
    expect(limiter.check("c").allowed).toBe(true);
    // a / b 仍在封禁窗口内，没有被提前解封
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b").allowed).toBe(false);
  });

  it("满桶时先清掉过期条目", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const limiter = createRateLimiter({
      windowMs: 1_000,
      maxAttempts: 2,
      maxEntries: 1,
    });

    expect(limiter.check("a").allowed).toBe(true);

    // a 的窗口过期后，插入 b 不需要淘汰任何有效桶
    vi.setSystemTime(1_000);
    expect(limiter.check("b").allowed).toBe(true);
  });
});

describe("getClientId", () => {
  it("x-real-ip 优先于 x-forwarded-for", () => {
    const request = new Request("http://localhost", {
      headers: {
        "x-real-ip": "9.9.9.9",
        "x-forwarded-for": "1.2.3.4",
      },
    });

    expect(getClientId(request)).toBe("9.9.9.9");
  });

  it("x-forwarded-for 取最右侧地址，左侧可被伪造", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });

    expect(getClientId(request)).toBe("5.6.7.8");
  });

  it("都缺失时返回 unknown", () => {
    expect(getClientId(new Request("http://localhost"))).toBe("unknown");
  });
});
