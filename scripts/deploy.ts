import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

type FlyResult = {
  status: number;
  stdout: string;
  stderr: string;
};

const appName = process.env.FLY_APP ?? "oneshot-blog";
const region = process.env.FLY_REGION ?? "iad";
const org = process.env.FLY_ORG ?? "";
const postgresApp = process.env.FLY_POSTGRES_APP ?? `${appName}-db`;
const ownerEmail = process.env.OWNER_EMAIL ?? "owner@example.com";
const ownerPassword =
  process.env.OWNER_PASSWORD ?? randomBytes(18).toString("base64url");
const seedToken =
  process.env.SEED_TOKEN ?? randomBytes(32).toString("base64url");
const flyctl = process.env.FLYCTL_BIN ?? "flyctl";
const apiToken = process.env.FLY_API_TOKEN;
const databaseUrl = process.env.DATABASE_URL;

function fly(args: string[], allowFailure = false): FlyResult {
  const env = { ...process.env };
  if (apiToken) env.FLY_API_TOKEN = apiToken;

  const result = spawnSync(flyctl, args, {
    encoding: "utf8",
    env,
  });

  if (result.error) {
    throw new Error(
      `Could not run ${flyctl}. Install flyctl or set FLYCTL_BIN. ${result.error.message}`,
    );
  }

  const output: FlyResult = {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };

  if (output.status !== 0 && !allowFailure) {
    process.stderr.write(output.stderr);
    throw new Error(`flyctl ${args.join(" ")} failed with status ${output.status}.`);
  }

  return output;
}

function appExists(name: string): boolean {
  const result = fly(["apps", "list", "--json"]);
  try {
    const apps = JSON.parse(result.stdout) as Array<{ Name?: string }>;
    return apps.some((app) => app.Name === name);
  } catch {
    return false;
  }
}

function ensureApp(): void {
  if (appExists(appName)) {
    console.log(`App ${appName} already exists.`);
    return;
  }
  const args = ["apps", "create", appName, "--yes"];
  if (org) args.push("--org", org);
  fly(args);
  console.log(`Created app ${appName}.`);
}

function ensurePostgres(): void {
  if (databaseUrl) {
    console.log("Using the DATABASE_URL supplied by the environment.");
    return;
  }

  if (!appExists(postgresApp)) {
    const args = [
      "postgres",
      "create",
      "--name",
      postgresApp,
      "--region",
      region,
      "--vm-size",
      "shared-cpu-1x",
      "--volume-size",
      "1",
      "--initial-cluster-size",
      "1",
    ];
    if (org) args.push("--org", org);
    fly(args);
    console.log(`Created Postgres app ${postgresApp}.`);
  } else {
    console.log(`Postgres app ${postgresApp} already exists.`);
  }

  fly(["postgres", "attach", postgresApp, "--app", appName, "--yes"], true);
}

function setSecrets(): void {
  const secrets = [`SEED_TOKEN=${seedToken}`];
  if (databaseUrl) secrets.push(`DATABASE_URL=${databaseUrl}`);
  fly(["secrets", "set", "--app", appName, "--stage", ...secrets]);
}

async function waitForHealth(): Promise<void> {
  const healthUrl = `https://${appName}.fly.dev/health`;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(healthUrl, {
        signal: AbortSignal.timeout(5_000),
      });
      if (response.ok) return;
    } catch {
      // The app is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error(`The app did not become healthy at ${healthUrl}.`);
}

async function seedOwner(): Promise<void> {
  const response = await fetch(
    new URL("/internal/seed", `https://${appName}.fly.dev`),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Seed-Token": seedToken,
      },
      body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
    },
  );

  if (response.status === 409) {
    console.log("Owner account already exists. Skipping seed.");
    return;
  }

  if (!response.ok) {
    throw new Error(`Seed failed (${response.status}): ${await response.text()}`);
  }
}

async function main(): Promise<void> {
  ensureApp();
  ensurePostgres();
  setSecrets();

  fly([
    "deploy",
    ".",
    "--app",
    appName,
    "--remote-only",
    "--yes",
  ]);

  await waitForHealth();
  await seedOwner();

  console.log("");
  console.log(`Deployed: https://${appName}.fly.dev`);
  console.log(`Owner email: ${ownerEmail}`);
  if (!process.env.OWNER_PASSWORD) {
    console.log(`Generated owner password: ${ownerPassword}`);
  }
  console.log(`SEED_TOKEN: ${seedToken}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
