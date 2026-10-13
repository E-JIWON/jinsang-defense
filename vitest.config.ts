import { defineConfig } from "vitest/config";

// vite.config.ts의 Cloudflare 플러그인은 테스트에 필요 없어서 따로 둔다.
export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", include: ["src/**/*.test.ts"] } },
      { test: { name: "e2e", include: ["e2e/**/*.e2e.ts"], testTimeout: 30_000, hookTimeout: 30_000 } },
    ],
  },
});
