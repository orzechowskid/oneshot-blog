import { redirect } from "react-router";
import { clearCookie, parseCookieHeader, serializeCookie } from "./cookies";
import { ensureSchema, getPool } from "./db.server";
import {
  createSessionToken,
  hashSessionToken,
  verifyPassword,
} from "./password";

export const SESSION_COOKIE = "blog_session";
const SESSION_DAYS = 7;

export type User = {
  id: string;
  email: string;
};

function cookieSecure(): boolean {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}

function sessionCookie(token: string, maxAge: number): string {
  return serializeCookie(SESSION_COOKIE, token, {
    maxAge,
    path: "/",
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "Lax",
  });
}

export function sessionCookieForToken(token: string): string {
  return sessionCookie(token, SESSION_DAYS * 24 * 60 * 60);
}

export function clearedSessionCookie(): string {
  return clearCookie(SESSION_COOKIE, "/");
}

export async function getOptionalUser(request: Request): Promise<User | null> {
  await ensureSchema();
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const result = await getPool().query<User & { expires_at: string }>(
    `SELECT users.id, users.email, sessions.expires_at
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = $1 AND sessions.expires_at > now()`,
    [tokenHash],
  );

  const row = result.rows[0];
  if (!row) return null;
  return { id: row.id, email: row.email };
}

export async function requireUser(request: Request): Promise<User> {
  const user = await getOptionalUser(request);
  if (!user) {
    const url = new URL(request.url);
    const redirectTo = `${url.pathname}${url.search}`;
    throw redirect(`/login?redirectTo=${encodeURIComponent(redirectTo)}`);
  }
  return user;
}

export async function authenticate(
  email: string,
  password: string,
): Promise<User | null> {
  await ensureSchema();
  const result = await getPool().query<{
    id: string;
    email: string;
    password_hash: string;
  }>("SELECT id, email, password_hash FROM users WHERE email = $1", [
    email.toLowerCase(),
  ]);

  const row = result.rows[0];
  if (!row) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  return { id: row.id, email: row.email };
}

export async function createSession(userId: string): Promise<string> {
  await ensureSchema();
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await getPool().query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );

  return sessionCookieForToken(token);
}

export async function destroySession(request: Request): Promise<void> {
  await ensureSchema();
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const token = cookies[SESSION_COOKIE];
  if (!token) return;
  await getPool().query("DELETE FROM sessions WHERE token_hash = $1", [
    hashSessionToken(token),
  ]);
}
