import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

type FlyResult = {
  status: number;
  stdout: string;
  stderr: string;
};

type EnvironmentRow = {
  app: string;
  postgresApp: string;
  configFile: string;
  region: string;
  volumeSize: number;
};

// The single source of truth for the per-environment names.
const environments: Record<string, EnvironmentRow> = {
  prod: {
    app: "danorz-com-blog-prod",
    postgresApp: "danorz-com-blog-prod-db",
    configFile: "fly.prod.toml",
    region: "iad",
    volumeSize: 1,
  },
  stage: {
    app: "danorz-com-blog-stage",
    postgresApp: "danorz-com-blog-stage-db",
    configFile: "fly.stage.toml",
    region: "iad",
    volumeSize: 1,
  },
};

export function resolveEnvironment(name: string): EnvironmentRow | undefined {
  return name === "prod" || name === "stage" ? environments[name] : undefined;
}

const flyctl = process.env.FLYCTL_BIN ?? "flyctl";
const apiToken = process.env.FLY_API_TOKEN;

// Failure label for a command line. A secret value must not reach the
// pipeline log: any argument that starts with ADMIN_EMAIL= or
// ADMIN_PASSWORD= is replaced by its argument name plus a redaction marker.
function redactSecretArgs(args: string[]): string {
  return args
    .map((arg) => {
      if (
        arg.startsWith("ADMIN_EMAIL=") ||
        arg.startsWith("ADMIN_PASSWORD=")
      ) {
        return `${arg.slice(0, arg.indexOf("="))}=<redacted>`;
      }
      return arg;
    })
    .join(" ");
}

function fly(
  args: string[],
  allowFailure = false,
  carriesSecret = false,
): FlyResult {
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
    // A call that carries a secret must not echo the deploy tool's standard
    // error, which may repeat the secret values.
    if (!carriesSecret) {
      process.stderr.write(output.stderr);
    }
    throw new Error(
      `flyctl ${redactSecretArgs(args)} failed with status ${output.status}.`,
    );
  }

  return output;
}

export function shouldAttachPostgres(deployedSecretNames: string[]): boolean {
  return !deployedSecretNames.includes("DATABASE_URL");
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

function refuseEnvironment(): never {
  console.error(
    `The first argument must be an environment name. ` +
      `Accepted names: prod, stage. ` +
      `No app was created and no secret was written. ` +
      `Run the deploy with one of these commands:`,
  );
  console.error(`node scripts/deploy.ts prod --config fly.prod.toml`);
  console.error(`node scripts/deploy.ts stage --config fly.stage.toml`);
  process.exit(1);
}

function statusAppName(parsed: unknown): string | undefined {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }
  const record = parsed as { app?: unknown; name?: unknown; Name?: unknown };
  const app = record.app;
  if (typeof app === "object" && app !== null && !Array.isArray(app)) {
    const inner = app as { name?: unknown; Name?: unknown };
    if (typeof inner.name === "string" && inner.name !== "") {
      return inner.name;
    }
    if (typeof inner.Name === "string" && inner.Name !== "") {
      return inner.Name;
    }
  }
  if (typeof record.name === "string" && record.name !== "") {
    return record.name;
  }
  if (typeof record.Name === "string" && record.Name !== "") {
    return record.Name;
  }
  return undefined;
}

function refuseStatusRead(app: string, roleWord = ""): never {
  const created = roleWord === "" ? "app" : `${roleWord} app`;
  console.error(
    `Could not read the status of app ${app}. ` +
      `Run the status command by hand and check its output: ` +
      `flyctl status --app ${app} --json. ` +
      `No ${created} was created and no secret was written.`,
  );
  process.exit(1);
}

function probeApp(app: string): "exists" | "missing" | "unreadable" {
  const result = fly(["status", "--app", app, "--json"], true);
  if (result.status !== 0) {
    const combined = `${result.stdout}\n${result.stderr}`.toLowerCase();
    return combined.includes("not found") ? "missing" : "unreadable";
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return "unreadable";
  }
  return statusAppName(parsed) === undefined ? "unreadable" : "exists";
}

function ensureApp(row: EnvironmentRow): void {
  const probe = probeApp(row.app);
  if (probe === "unreadable") {
    refuseStatusRead(row.app);
  }
  if (probe === "exists") {
    console.log(`App ${row.app} already exists.`);
    return;
  }
  fly(["apps", "create", row.app, "--yes"]);
  console.log(`Created app ${row.app}.`);
}

function refuseSecretListRead(app: string): never {
  console.error(
    `Could not read the deployed app's secret names. ` +
      `Run the list command by hand and check its output: ` +
      `flyctl secrets list --app ${app} --json. ` +
      `Nothing was changed and no secret was written.`,
  );
  process.exit(1);
}

function entryName(entry: unknown): string | undefined {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    return undefined;
  }
  const record = entry as { name?: unknown; Name?: unknown };
  if (typeof record.name === "string" && record.name !== "") {
    return record.name;
  }
  if (typeof record.Name === "string" && record.Name !== "") {
    return record.Name;
  }
  return undefined;
}

function listDeployedSecretNames(app: string): string[] {
  const result = fly(["secrets", "list", "--app", app, "--json"], true);
  if (result.status !== 0) {
    refuseSecretListRead(app);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    refuseSecretListRead(app);
  }
  if (!Array.isArray(parsed)) {
    refuseSecretListRead(app);
  }
  return parsed.map((entry) => {
    const name = entryName(entry);
    if (name === undefined) {
      refuseSecretListRead(app);
    }
    return name;
  });
}

function ensurePostgres(row: EnvironmentRow): void {
  const secretNames = listDeployedSecretNames(row.app);
  if (!shouldAttachPostgres(secretNames)) {
    console.log(
      `App ${row.app} already has a DATABASE_URL secret. Leaving the database untouched.`,
    );
    return;
  }

  const probe = probeApp(row.postgresApp);
  if (probe === "unreadable") {
    refuseStatusRead(row.postgresApp, "Postgres");
  }
  if (probe === "missing") {
    const args = [
      "postgres",
      "create",
      "--name",
      row.postgresApp,
      "--region",
      row.region,
      "--vm-size",
      "shared-cpu-1x",
      "--volume-size",
      String(row.volumeSize),
      "--initial-cluster-size",
      "1",
    ];
    fly(args);
    console.log(`Created Postgres app ${row.postgresApp}.`);
  } else {
    console.log(`Postgres app ${row.postgresApp} already exists.`);
  }

  const attach = fly(
    ["postgres", "attach", row.postgresApp, "--app", row.app],
    true,
  );
  if (attach.status !== 0) {
    console.error(
      `Could not attach the Postgres app. ` +
        `Run the attach command by hand: ` +
        `flyctl postgres attach ${row.postgresApp} --app ${row.app}. ` +
        `No secret was written and nothing was deployed.`,
    );
    process.exit(1);
  }
}

function setSecrets(
  row: EnvironmentRow,
  adminEmail: string,
  adminPassword: string,
): void {
  const secrets = buildDeploySecrets(adminEmail, adminPassword);
  console.log(
    `Storing ADMIN_EMAIL and ADMIN_PASSWORD as Fly secrets for app ${row.app} (${adminEmail}).`,
  );
  fly(["secrets", "set", "--app", row.app, "--stage", ...secrets], false, true);
}

async function waitForHealth(app: string): Promise<void> {
  const healthUrl = `https://${app}.fly.dev/health`;
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

function parseDeployArgs(args: string[]): {
  envName: string | undefined;
  configFile: string | undefined;
} {
  const parsed: {
    envName: string | undefined;
    configFile: string | undefined;
  } = { envName: undefined, configFile: undefined };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (arg === "--config") {
      i += 1;
      const value = args[i];
      if (value !== undefined) parsed.configFile = value;
      continue;
    }
    if (arg.startsWith("--")) continue;
    if (parsed.envName === undefined) parsed.envName = arg;
  }
  return parsed;
}

async function main(): Promise<void> {
  const { envName, configFile } = parseDeployArgs(process.argv.slice(2));

  if (envName === undefined) {
    refuseEnvironment();
  }
  const row = resolveEnvironment(envName);
  if (row === undefined) {
    refuseEnvironment();
  }

  const adminEmail = process.env.ADMIN_EMAIL ?? "";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "";
  const apiTokenValue = process.env.FLY_API_TOKEN ?? "";
  const missing = [
    ...(apiTokenValue ? [] : ["FLY_API_TOKEN"]),
    ...(adminEmail ? [] : ["ADMIN_EMAIL"]),
    ...(adminPassword ? [] : ["ADMIN_PASSWORD"]),
  ];
  if (missing.length > 0) {
    console.error(
      `Missing required environment variables: ${missing.join(", ")}.`,
    );
    const missingCreds = missing.filter((name) => name !== "FLY_API_TOKEN");
    if (missingCreds.length > 0) {
      console.error(
        `The admin credential pair is ADMIN_EMAIL and ADMIN_PASSWORD; ` +
          `missing from the pair: ${missingCreds.join(", ")}. ` +
          `Run the deploy with one of these commands:`,
      );
      console.error(`node scripts/deploy.ts prod --config fly.prod.toml`);
      console.error(`node scripts/deploy.ts stage --config fly.stage.toml`);
    }
    console.error(
      "Set the missing variables in the environment, then run the deploy again.",
    );
    process.exit(1);
  }

  if (configFile === undefined) {
    console.error(
      `A --config <file> argument is required for the ${envName} environment. ` +
        `Expected ${row.configFile}. ` +
        `No app was created and no secret was written.`,
    );
    process.exit(1);
  }
  if (configFile !== row.configFile) {
    console.error(
      `The --config value ${configFile} does not match the ${envName} environment. ` +
        `Expected ${row.configFile}. ` +
        `No app was created and no secret was written.`,
    );
    process.exit(1);
  }

  try {
    readFileSync(configFile);
  } catch {
    console.error(
      `Could not read the configuration file ${configFile}. ` +
        `Check that the file exists in the repository root and is readable, then run the deploy again. ` +
        `No app was created and no secret was written.`,
    );
    process.exit(1);
  }

  ensureApp(row);
  ensurePostgres(row);
  setSecrets(row, adminEmail, adminPassword);

  fly([
    "deploy",
    ".",
    "--app",
    row.app,
    "--config",
    configFile,
    "--remote-only",
    "--yes",
  ]);

  await waitForHealth(row.app);

  console.log("");
  console.log(`Deployed: https://${row.app}.fly.dev`);
}

// Runs only when executed directly (node scripts/deploy.ts), so a unit test
// can import the decision functions without a deploy.
const isEntry =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntry) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
