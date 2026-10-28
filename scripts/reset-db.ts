import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const { Client } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query(
    "DROP TABLE IF EXISTS sessions, images, posts, users CASCADE",
  );
  const schema = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8");
  await client.query(schema);
  console.log("Database reset.");
} finally {
  await client.end();
}
