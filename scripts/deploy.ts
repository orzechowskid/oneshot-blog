import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

type FlyResult = {
  status: number;
  stdout: string;
  stderr: string;
};

const appName = process.env.FLY_APP ?? "oneshot-blog";
const region = process.env.FLY_REGION ?? "iad";
const org = process.env.FLY_ORG ?? "";
const postgresApp = process.env.FLY_POSTGRES_APP ?? `${appName}-db`;
const flyctl = process.env.FLYCTL_BIN ?? "flyctl";
const apiToken = process.env.FLY_API_TOKEN;

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

export function shouldAttachPostgres(deployedSecretNames: string[]): boolean {
  return !deployedSecretNames.includes("DATABASE_URL");
}

function refuseSecretListRead(): never {
  console.error(
    `Could not read the deployed app's secret names. ` +
      `Run the list command by hand and check its output: ` +
      `fly secrets list --app ${appName} --json. ` +
      `Nothing was changed and no secret was written.`,
  );
  process.exit(1);
}

function listDeployedSecretNames(): string[] {
  const result = fly(["secrets", "list", "--app", appName, "--json"], true);
  if (result.status !== 0) {
    refuseSecretListRead();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    refuseSecretListRead();
  }
  if (!Array.isArray(parsed)) {
    refuseSecretListRead();
  }
  return parsed.map((entry) => (entry as { Name?: string }).Name ?? "");
}

function ensurePostgres(): void {
  const secretNames = listDeployedSecretNames();
  if (!shouldAttachPostgres(secretNames)) {
    console.log(
      `App ${appName} already has a DATABASE_URL secret. Leaving the database untouched.`,
    );
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

  fly(["postgres", "attach", postgresApp, "--app", appName, "--yes"]);
}

export function buildDeploySecrets(
  adminEmail: string,
  adminPassword: string,
): string[] {
  return [
    `ADMIN_EMAIL=${adminEmail}`,
    `ADMIN_PASSWORD=${adminPassword}`,
  ];
}

function setSecrets(adminEmail: string, adminPassword: string): void {
  const secrets = buildDeploySecrets(adminEmail, adminPassword);
  console.log(
    `Storing ADMIN_EMAIL and ADMIN_PASSWORD as Fly secrets for app ${appName} (${adminEmail}).`,
  );
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

async function main(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    console.error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD in the environment or .env, then run the deploy again.",
    );
    process.exit(1);
  }

  ensureApp();
  ensurePostgres();
  setSecrets(adminEmail, adminPassword);

  fly([
    "deploy",
    ".",
    "--app",
    appName,
    "--remote-only",
    "--yes",
  ]);

  await waitForHealth();

  console.log("");
  console.log(`Deployed: https://${appName}.fly.dev`);
}

// Runs only when executed directly (node scripts/deploy.ts), so a unit test
// can import buildDeploySecrets and shouldAttachPostgres without a deploy.
const isEntry =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntry) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
