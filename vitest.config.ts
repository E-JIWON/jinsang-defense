import { defineConfig } from "vitest/config";

// vite.config.ts의 Cloudflare 플러그인은 테스트에 필요 없어서 따로 둔다.
export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", include: ["src/**/*.test.ts"] } },
      // npm run compare: 주력 AI와 내 PC 예비 AI 비교(진짜 AI를 부르므로 check에는 안 넣는다)
      { test: { name: "compare", include: ["scripts/**/*.compare.ts"], testTimeout: 600_000 } },
      { test: { name: "e2e", include: ["e2e/**/*.e2e.ts"], testTimeout: 30_000, hookTimeout: 30_000 } },
    ],
  },
});
