import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(process.cwd()),
    },
  },
  test: {
    environment: "node",
    // tsx 预留给后续前端组件测试；需要 DOM 时再单独用 environment: "jsdom"
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
