import { defineConfig } from "@playwright/test";

const port = Number(process.env.STORYBOOK_PORT ?? 6006);

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/serve-storybook.ts",
    cwd: process.cwd(),
    url: `http://127.0.0.1:${port}/index.json`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
