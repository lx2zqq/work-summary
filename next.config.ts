import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
