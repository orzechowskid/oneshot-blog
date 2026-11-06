import { defineConfig } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./tests/integration/test-account";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://blog:blog@127.0.0.1:5432/blog";
const password = process.env.ADMIN_PASSWORD ?? ADMIN_PASSWORD;
const email = process.env.ADMIN_EMAIL ?? ADMIN_EMAIL;

export default defineConfig({
  testDir: "tests/integration",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run build && node scripts/reset-db.ts && node server.ts",
    url: "http://127.0.0.1:3000/health",
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: "3000",
      DATABASE_URL: databaseUrl,
      ADMIN_PASSWORD: password,
      ADMIN_EMAIL: email,
      COOKIE_SECURE: "false",
    },
  },
});
