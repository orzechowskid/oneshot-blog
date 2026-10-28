import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { hashPassword } from "./password";
import { validateEmail, validatePassword } from "./validation";

const { Pool } = pg;

let pool: pg.Pool | null = null;
let schemaPromise: Promise<void> | null = null;

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set.");
  }
  return url;
}

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: connectionString(),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl:
        process.env.DATABASE_SSL === "true"
          ? { rejectUnauthorized: false }
          : undefined,
    });
    pool.on("error", (error) => {
      console.error("PostgreSQL pool error", error);
    });
  }
  return pool;
}

async function initializeSchema(): Promise<void> {
  const schemaPath = process.env.SCHEMA_PATH ?? join(process.cwd(), "db", "schema.sql");
  const schema = readFileSync(schemaPath, "utf8");
  await getPool().query(schema);
  await bootstrapOwner();
}

async function bootstrapOwner(): Promise<void> {
  const password = process.env.BOOTSTRAP_PASSWORD;
  if (!password) return;

  const passwordError = validatePassword(password);
  if (passwordError) {
    throw new Error(`BOOTSTRAP_PASSWORD is invalid: ${passwordError}`);
  }

  const email = (process.env.BOOTSTRAP_EMAIL ?? "owner@example.com").toLowerCase();
  const emailError = validateEmail(email);
  if (emailError) {
    throw new Error(`BOOTSTRAP_EMAIL is invalid: ${emailError}`);
  }

  const existing = await getPool().query<{ count: string }>(
    "SELECT count(*)::text AS count FROM users",
  );
  if (existing.rows[0]?.count !== "0") return;

  await getPool().query(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2)",
    [email, hashPassword(password)],
  );
}

export function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = initializeSchema().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
