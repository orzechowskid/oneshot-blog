// scripts/deploy.ts exports the three decision functions buildDeploySecrets,
// resolveEnvironment, and shouldAttachPostgres and runs main() only when executed
// directly, so this
// file imports them in a node environment with no flyctl call, no network,
// and no deploy. It asserts that the secret list builder returns exactly the
// admin pair and never a DATABASE_URL or SEED_TOKEN entry, even with a local
// DATABASE_URL in the environment, that the attach decision returns true only
// when the deployed secret names lack DATABASE_URL, and that the module
// exports no seeding step.

import * as deployModule from "../../scripts/deploy";
import {
  buildDeploySecrets,
  resolveEnvironment,
  shouldAttachPostgres,
} from "../../scripts/deploy";
import { expect, test } from "vitest";

const FIXTURE_EMAIL = "deploy-test@example.com";
const FIXTURE_PASSWORD = "a-long-password";
const LOCAL_DATABASE_URL = "postgres://blog:blog@127.0.0.1:5432/blog";

test("buildDeploySecrets returns exactly the admin pair and never a DATABASE_URL or SEED_TOKEN entry, even with a local DATABASE_URL set", () => {
  expect(buildDeploySecrets(FIXTURE_EMAIL, FIXTURE_PASSWORD)).toEqual([
    "ADMIN_EMAIL=deploy-test@example.com",
    "ADMIN_PASSWORD=a-long-password",
  ]);

  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = LOCAL_DATABASE_URL;
  try {
    const secrets = buildDeploySecrets(FIXTURE_EMAIL, FIXTURE_PASSWORD);
    for (const secret of secrets) {
      expect(secret.startsWith("DATABASE_URL=")).toBe(false);
      expect(secret.startsWith("SEED_TOKEN=")).toBe(false);
    }
  } finally {
    if (previous === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previous;
    }
  }
});

test("shouldAttachPostgres is true when the deployed secrets lack DATABASE_URL", () => {
  expect(shouldAttachPostgres(["ADMIN_EMAIL", "ADMIN_PASSWORD"])).toBe(true);
});

test("shouldAttachPostgres is false when the deployed secrets contain DATABASE_URL", () => {
  expect(
    shouldAttachPostgres(["ADMIN_EMAIL", "ADMIN_PASSWORD", "DATABASE_URL"]),
  ).toBe(false);
});

test("shouldAttachPostgres is true for an empty deployed secret list", () => {
  expect(shouldAttachPostgres([])).toBe(true);
});

test("resolveEnvironment returns the production row exactly for prod", () => {
  expect(resolveEnvironment("prod")).toEqual({
    app: "danorz-com-blog-prod",
    postgresApp: "danorz-com-blog-prod-db",
    configFile: "fly.prod.toml",
    region: "iad",
    volumeSize: 1,
  });
});

test("resolveEnvironment returns the pre-production row exactly for stage", () => {
  expect(resolveEnvironment("stage")).toEqual({
    app: "danorz-com-blog-stage",
    postgresApp: "danorz-com-blog-stage-db",
    configFile: "fly.stage.toml",
    region: "iad",
    volumeSize: 1,
  });
});

test("resolveEnvironment returns undefined for a name that is neither prod nor stage", () => {
  expect(resolveEnvironment("production")).toBeUndefined();
});

test("the module exports no seeding step: the export list is exactly the three decision functions", () => {
  expect(Object.keys(deployModule).sort()).toEqual([
    "buildDeploySecrets",
    "resolveEnvironment",
    "shouldAttachPostgres",
  ]);
});
