import { defineConfig } from "@playwright/test";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://blog:blog@127.0.0.1:5432/blog";
const password = process.env.BOOTSTRAP_PASSWORD ?? "test-owner-password";
const email = process.env.BOOTSTRAP_EMAIL ?? "owner@example.com";

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
      BOOTSTRAP_PASSWORD: password,
      BOOTSTRAP_EMAIL: email,
      COOKIE_SECURE: "false",
      SEED_TOKEN: "integration-test-seed-token",
    },
  },
});
