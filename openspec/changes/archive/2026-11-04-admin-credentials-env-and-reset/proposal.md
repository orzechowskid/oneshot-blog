# Proposal: admin-credentials-env-and-reset

## Why

The one admin account of the blog is described by four environment variables,
`BOOTSTRAP_EMAIL`, `BOOTSTRAP_PASSWORD`, `OWNER_EMAIL`, `OWNER_PASSWORD`, but
they carry one set of values: `scripts/install.ts:272-277` writes the same email
and password into all four. Four names for one credential pair is a source of
misconfiguration: an operator who sets only the "owner" pair, or only the
"bootstrap" pair, ends up with a server that silently skips admin creation
(`app/lib/db.server.ts:46-71` returns early when the password variable is
unset) or with a mismatch between the account the app creates and the account a
script expects.

There is also no supported way to change the admin credential after first
install. `POST /internal/seed` refuses with 409 once any user exists
(`app/routes/seed.tsx:49-51`), so a forgotten or leaked password can only be
fixed by editing the database by hand.

## What Changes

- **BREAKING**: `BOOTSTRAP_EMAIL`, `BOOTSTRAP_PASSWORD`, `OWNER_EMAIL`,
  `OWNER_PASSWORD` are removed. The surviving pair is `ADMIN_EMAIL` and
  `ADMIN_PASSWORD`. No fallback read of the old names: a deployment that keeps
  only the old variables no longer creates or rotates an admin account.
- Server start reads `ADMIN_EMAIL`/`ADMIN_PASSWORD` and inserts the admin row
  when `users` is empty. The silent early return is kept: if the password
  variable is unset, admin creation is skipped and no row is written.
- New reset command `scripts/owner-reset.ts`, run as `npm run owner:reset` and
  on the Fly machine as
  `fly ssh console -a oneshot-blog -C "node scripts/owner-reset.ts"`. It reads
  `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` from the environment only.
  It inserts when `users` has zero rows, updates the single row when it has one
  row, and refuses without changing anything when it has more than one row.
  Existing sessions are not touched.
- **BREAKING**: `scripts/deploy.ts` stops generating a random password and stops
  printing it. With `ADMIN_EMAIL`/`ADMIN_PASSWORD` absent it refuses to deploy
  and prints a clear instruction naming both variables.
- No `owner@example.com` default in app code or scripts. The four current
  defaults (`app/lib/db.server.ts:55`, `scripts/deploy.ts:14`,
  `scripts/seed.ts:3`, `playwright.config.ts:6`) become required values; fixed
  test credentials remain only in `tests/integration/`, where a fixed test
  account is intended.
- `Dockerfile` copies `scripts/` into the runtime image so the reset command
  can run inside the Fly machine without copying a database credential to a
  laptop.
- `.env.example` and `README.md` are rewritten for the two-variable model in
  the same change as the code, because the silent skip makes stale docs
  dangerous.

## Capabilities

### New Capabilities

- `admin-credentials`: how the single admin account is created at server start,
  how the credential is reset outside the app, and how deploy and the seed
  route interact with the admin credential. `openspec/specs` is empty, so this
  is the project's first capability.

### Modified Capabilities

_(none — there are no existing specs)_

## Non-goals

- No in-app password page or admin UI for credentials. Credential changes
  happen only through the environment and the reset command.
- No removal of `POST /internal/seed` or `SEED_TOKEN`. The seed route stays as
  a 409-when-users-exist endpoint; removing it is a separate change.
- No multi-user support. The app has one admin account, now and in future.

## Impact

- App code: `app/lib/db.server.ts` (admin row creation), `app/lib/password.ts`
  (reused hash format, unchanged), `app/lib/validation.ts` (password length
  rule, unchanged).
- Scripts: `scripts/deploy.ts`, `scripts/seed.ts`, `scripts/install.ts`
  (rename and removal of defaults), new `scripts/owner-reset.ts`,
  `package.json` (`owner:reset` entry).
- Packaging: `Dockerfile` gains one `COPY --from=build /app/scripts ./scripts`
  line after line 19.
- Docs/config: `.env.example`, `README.md`.
- Tests: `playwright.config.ts` and the five `tests/integration/*.spec.ts`
  files move from the old variable names to `ADMIN_EMAIL`/`ADMIN_PASSWORD`
  (fixed test credentials stay in the test files).
- Deployment: `.env` and Fly secrets gain `ADMIN_EMAIL` and `ADMIN_PASSWORD`
  (additive; `DATABASE_URL` and `SEED_TOKEN` are unchanged).
