import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 这个应用没有按 Cache Components 的动态数据模型设计；
  // Vercel 构建环境可能自动开启它，导致动态页面一直挂起
  cacheComponents: false,
  // PGlite 内含 WASM，交给 Node 运行时按需加载，避免被打包器改写
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
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
