import { describe, expect, it } from "vitest";
import { getRequestOrigin, isSameOriginRequest } from "@/lib/request-origin";

describe("getRequestOrigin", () => {
  it("反代下用 x-forwarded-host 和 x-forwarded-proto 还原对外 origin", () => {
    const request = new Request("http://127.0.0.1:3000/api/auth/logout", {
      headers: {
        "x-forwarded-host": "review.example.com",
        "x-forwarded-proto": "https",
      },
    });

    expect(getRequestOrigin(request)).toBe("https://review.example.com");
  });

  it("多级代理时取第一个转发值", () => {
    const request = new Request("http://127.0.0.1:3000/api/auth/logout", {
      headers: {
        "x-forwarded-host": "review.example.com, inner.local",
        "x-forwarded-proto": "https, http",
      },
    });

    expect(getRequestOrigin(request)).toBe("https://review.example.com");
  });

  it("没有代理头时退回请求自身的协议和 host", () => {
    const request = new Request("http://127.0.0.1:3000/api/auth/logout");

    expect(getRequestOrigin(request)).toBe("http://127.0.0.1:3000");
  });

  it("代理头协议非法时忽略该值", () => {
    const request = new Request("http://127.0.0.1:3000/api/auth/logout", {
      headers: {
        "x-forwarded-host": "review.example.com",
        "x-forwarded-proto": "javascript",
      },
    });

    expect(getRequestOrigin(request)).toBe("http://review.example.com");
  });
});

describe("isSameOriginRequest", () => {
  it("反代后面 Origin 与对外 origin 一致时放行", () => {
    const request = new Request("http://127.0.0.1:3000/api/auth/logout", {
      method: "POST",
      headers: {
        "x-forwarded-host": "review.example.com",
        "x-forwarded-proto": "https",
        origin: "https://review.example.com",
      },
    });

    expect(isSameOriginRequest(request)).toBe(true);
  });

  it("反代后面跨源 Origin 仍然拒绝", () => {
    const request = new Request("http://127.0.0.1:3000/api/auth/logout", {
      method: "POST",
      headers: {
        "x-forwarded-host": "review.example.com",
        "x-forwarded-proto": "https",
        origin: "https://evil.example.com",
      },
    });

    expect(isSameOriginRequest(request)).toBe(false);
  });

  it("没有 Origin 时用 Referer 判断", () => {
    const sameOrigin = new Request("http://127.0.0.1:3000/api/auth/logout", {
      method: "POST",
      headers: {
        "x-forwarded-host": "review.example.com",
        "x-forwarded-proto": "https",
        referer: "https://review.example.com/settings",
      },
    });
    const crossOrigin = new Request("http://127.0.0.1:3000/api/auth/logout", {
      method: "POST",
      headers: {
        "x-forwarded-host": "review.example.com",
        "x-forwarded-proto": "https",
        referer: "https://evil.example.com/page",
      },
    });

    expect(isSameOriginRequest(sameOrigin)).toBe(true);
    expect(isSameOriginRequest(crossOrigin)).toBe(false);
  });

  it("Origin 和 Referer 都缺失时放行", () => {
    const request = new Request("http://127.0.0.1:3000/api/auth/logout", {
      method: "POST",
    });

    expect(isSameOriginRequest(request)).toBe(true);
  });
});
