import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// HSTS 只对 HTTPS 响应生效，浏览器会忽略通过纯 HTTP 收到的该头。
// 因此默认开启对纯 HTTP 部署没有副作用；如果确实要关闭，设置 DISABLE_HSTS=1。
const hstsEnabled = process.env.DISABLE_HSTS !== "1";

/**
 * 基础 CSP，自托管 + Nginx/Caddy 反代同源部署时可直接使用。
 * - Next.js 的 RSC payload 是内联脚本，必须允许 'unsafe-inline'；
 * - 字体由 next/font 在构建时自托管，只需 'self' 和 data:；
 * - 录音用 MediaRecorder 生成 blob: URL，语音上传和接口请求都走同源；
 * - 开发模式 Turbopack 还会用 eval 和 WebSocket，只在 dev 放开。
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // 这个应用没有按 Cache Components 的动态数据模型设计；
  // 构建环境可能自动开启它，导致动态页面一直挂起
  cacheComponents: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          ...(hstsEnabled
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains",
                },
              ]
            : []),
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=()",
          },
        ],
      },
    ];
  },
  // PGlite 内含 WASM，交给 Node 运行时按需加载，避免被打包器改写；
  // exceljs 依赖 Node 文件系统读取模板，同样保持外部依赖
  serverExternalPackages: ["@electric-sql/pglite", "postgres", "exceljs"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
