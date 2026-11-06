import { randomBytes, scryptSync } from "node:crypto";
import { pathToFileURL } from "node:url";
import pg from "pg";

// Scrypt parameters mirrored from app/lib/password.ts (SCRYPT_N, SCRYPT_R,
// SCRYPT_P, KEY_LENGTH). The runtime image ships this file but not app/, so
// the values are duplicated here. The format string is the shared contract:
// verifyPassword in app/lib/password.ts accepts what this script writes.
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

// Password length bounds mirrored from app/lib/validation.ts
// (validatePassword): 12 to 200 characters inclusive.
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 200;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash.toString("base64url")}`;
}

export function passwordLengthError(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `admin password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `admin password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`;
  }
  return null;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main(): Promise<void> {
  // Credentials come from the environment only. process.argv is never read
  // for credentials because it is visible in shell history and the process list.
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    fail("DATABASE_URL is not set.");
  }
  const email = process.env.ADMIN_EMAIL;
  if (!email) {
    fail("ADMIN_EMAIL is not set.");
  }
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    fail("ADMIN_PASSWORD is not set.");
  }

  const passwordError = passwordLengthError(password);
  if (passwordError) {
    fail(`ADMIN_PASSWORD is invalid: ${passwordError}`);
  }

  const targetEmail = email.toLowerCase();
  const passwordHash = hashPassword(password);

  const client = new pg.Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 10_000,
    ssl:
      process.env.DATABASE_SSL === "true"
        ? { rejectUnauthorized: false }
        : undefined,
  });
  await client.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM users",
    );
    const count = result.rows[0]?.count ?? 0;
    if (count === 0) {
      await client.query("INSERT INTO users (email, password_hash) VALUES ($1, $2)", [
        targetEmail,
        passwordHash,
      ]);
    } else if (count === 1) {
      await client.query("UPDATE users SET email = $1, password_hash = $2", [
        targetEmail,
        passwordHash,
      ]);
    } else {
      await client.query("ROLLBACK");
      fail(
        `Refusing to reset: the users table has ${count} rows. ` +
          "Expected at most 1 row. Nothing was changed.",
      );
    }
    await client.query("COMMIT");
  } finally {
    await client.end();
  }

  // Prints only the resulting email address, never the password.
  console.log(targetEmail);
}

// Runs only when executed directly (node scripts/owner-reset.ts), so a unit
// test can import hashPassword and passwordLengthError without a database.
const isEntry =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntry) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
