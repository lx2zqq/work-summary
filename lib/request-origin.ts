/**
 * 从反向代理头还原浏览器看到的 origin。
 * 反代后面 request.url 可能是 http://127.0.0.1:3000，
 * 直接用它会和 Origin/Referer 对不上，导致正常请求被误判为跨源。
 *
 * Nginx 需要配置：
 *   proxy_set_header Host $host;
 *   proxy_set_header X-Forwarded-Host $host;
 *   proxy_set_header X-Forwarded-Proto $scheme;
 */
export function getRequestOrigin(request: Request): string {
  const url = new URL(request.url);

  // 多级代理时取第一个（最靠近浏览器的对外域名）
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const host =
    forwardedHost || request.headers.get("host")?.trim() || url.host;

  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    ?.toLowerCase();
  const proto =
    forwardedProto === "http" || forwardedProto === "https"
      ? forwardedProto
      : url.protocol === "http:" || url.protocol === "https:"
        ? url.protocol.slice(0, -1)
        : "https";

  return `${proto}://${host}`;
}

/** 判断请求是否来自同源页面：优先 Origin，其次 Referer，都没有时放行 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = getRequestOrigin(request);

  const requestOrigin = request.headers.get("origin");
  if (requestOrigin) return requestOrigin === origin;

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === origin;
    } catch {
      return false;
    }
  }

  // 部分浏览器和命令行工具不带这两个头，无法判断时按同源处理
  return true;
}
