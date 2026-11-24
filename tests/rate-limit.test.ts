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

  it("超过 maxEntries 时淘汰最早条目", () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      maxAttempts: 1,
      maxEntries: 2,
    });

    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);

    expect(limiter.check("b").allowed).toBe(true);
    // 插入 c 时容量已满，最早的 a 被淘汰
    expect(limiter.check("c").allowed).toBe(true);

    expect(limiter.check("b").allowed).toBe(false);
    // a 已被淘汰，重新计数后放行
    expect(limiter.check("a").allowed).toBe(true);
  });
});

describe("getClientId", () => {
  it("优先取 x-forwarded-for 的第一个地址", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });

    expect(getClientId(request)).toBe("1.2.3.4");
  });

  it("没有转发头时退回 x-real-ip", () => {
    const request = new Request("http://localhost", {
      headers: { "x-real-ip": "9.9.9.9" },
    });

    expect(getClientId(request)).toBe("9.9.9.9");
  });

  it("都缺失时返回 unknown", () => {
    expect(getClientId(new Request("http://localhost"))).toBe("unknown");
  });
});
