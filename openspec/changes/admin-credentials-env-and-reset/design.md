# Design: admin-credentials-env-and-reset

## Context

See proposal.md for motivation. The current state that shapes this design:

- One admin account, four variable names. `scripts/install.ts` writes the same
  email and password into `BOOTSTRAP_EMAIL`, `BOOTSTRAP_PASSWORD`,
  `OWNER_EMAIL`, and `OWNER_PASSWORD` (measured lines 272-277).
- Server start creates the admin row only from `BOOTSTRAP_PASSWORD` /
  `BOOTSTRAP_EMAIL` (`app/lib/db.server.ts:47-55`): silent early return when
  the password variable is unset; `owner@example.com` default for the email;
  insert only when `SELECT count(*) FROM users` is 0.
- The admin password is validated by `validatePassword`
  (`app/lib/validation.ts:132-140`): 12 to 200 characters inclusive.
- Passwords are hashed with scrypt in `app/lib/password.ts`:
  `hashPassword` emits `scrypt$16384$8$1$<salt>$<hash>` (N=16384, r=8, p=1,
  64-byte key, base64url salt and hash); `verifyPassword` parses that exact
  format at login.
- The runtime Docker image copies only `package.json`, `node_modules`,
  `build`, `db`, and `server.ts` (`Dockerfile` measured lines 16-20).
  `scripts/` and `app/` are absent from the runtime image. Node 24 runs the
  TypeScript entrypoint directly (`CMD ["node", "server.ts"]`).
- `scripts/deploy.ts` generates a random password when `OWNER_PASSWORD` is
  unset (`deploy.ts:14-16`) and prints it (`deploy.ts:169`); it sets only
  `SEED_TOKEN` (and `DATABASE_URL` if supplied) as Fly secrets.
- The production Fly app `oneshot-blog` has two secrets: `DATABASE_URL`,
  `SEED_TOKEN`. The admin row in production was created through
  `POST /internal/seed`, which 409s once any user exists
  (`app/routes/seed.tsx:49-51`) and therefore cannot rotate a credential.
- Integration tests run against a web server started by
  `playwright.config.ts`, which passes the credential pair to the server's
  environment (`playwright.config.ts:5-6, 30-31`); the spec files fall back to
  the fixed test account (`owner@example.com` / `test-owner-password`).

Constraints carried from the decision record: the runtime image gains exactly
one new `COPY` line; the reset command reads credentials from the environment
only; the npm script is `owner:reset` in `scripts/owner-reset.ts`.

## Goals / Non-Goals

**Goals:**

- One credential pair, two variable names, read consistently by the server,
  the deploy script, and the seed script.
- A supported out-of-app credential reset that runs inside the Fly machine.
- Deploy refuses early, loudly, when the pair is missing.
- Docs (`.env.example`, `README.md`) state the same two-variable model as the
  code, in the same change.

**Non-Goals:** (see proposal.md for scope)

- No in-app credential UI, no seed-route removal, no multi-user support.
- No change to the hash format, the password length rule, or the sessions
  table.

## Decisions

### D1: Straight rename, no fallback reads

Every occurrence of the four old names outside `tests/integration/` becomes
the new name. The change also removes all five `owner@example.com` defaults
in app code and scripts: the four in the decision record's inventory
(`app/lib/db.server.ts:55`, `scripts/deploy.ts:14`, `scripts/seed.ts:3`,
`playwright.config.ts:6`), and the fifth at `scripts/install.ts:260`, the
email prompt default. There is no read of the old names anywhere, so a
deployment that keeps only old variables silently has no admin credential
(the preserved silent-skip behaviour) — the README and the deploy refusal
make this consequence visible. Per-file mechanics:

| File | Change |
|---|---|
| `app/lib/db.server.ts` (lines 47, 52, 55, 58) | `BOOTSTRAP_PASSWORD` → `ADMIN_PASSWORD` (read and error message); `BOOTSTRAP_EMAIL ?? "owner@example.com"` → `ADMIN_EMAIL ?? ""` (default removed, see D2); `BOOTSTRAP_EMAIL` error message → `ADMIN_EMAIL`. The early return on unset password, the `validatePassword` check, the count-zero guard, and the insert are unchanged. |
| `app/lib/validation.ts` (line 134) | The operator-facing string changes from "Use at least 12 characters for the owner password." to "Use at least 12 characters for the admin password." The 12-to-200 rule and the other checks are unchanged. |
| `scripts/deploy.ts` (lines 14, 16, 169) | `OWNER_EMAIL ?? "owner@example.com"` → required `ADMIN_EMAIL`; `OWNER_PASSWORD ?? randomBytes(...)` → required `ADMIN_PASSWORD` (generation removed, see D3); the `Generated owner password` print at line 169 is removed. `setSecrets` adds `ADMIN_EMAIL` and `ADMIN_PASSWORD` to the secrets list (additive; `SEED_TOKEN` handling unchanged). |
| `scripts/deploy.ts` (new print) | The script prints one line naming the app and the email whose credential it is storing as a Fly secret, so a deploy that writes a production credential is visible to the operator. |
| `scripts/seed.ts` (lines 3, 4, 10) | `OWNER_EMAIL ?? "owner@example.com"` → required `ADMIN_EMAIL`; `OWNER_PASSWORD` → `ADMIN_PASSWORD`; the existing `OWNER_PASSWORD is required` error becomes `ADMIN_PASSWORD is required`, and a matching `ADMIN_EMAIL is required` check is added. The 409 handling is unchanged. |
| `scripts/install.ts` (lines 260, 272-277, 321-322) | Line 260: the email prompt keeps no `owner@example.com` default; the installer prompts for the value and validates it. Local mode: the four entries `BOOTSTRAP_EMAIL`, `BOOTSTRAP_PASSWORD`, `OWNER_EMAIL`, `OWNER_PASSWORD` collapse to `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Fly mode: the two `OWNER_*` entries become `ADMIN_EMAIL` and `ADMIN_PASSWORD`. The installer still asks once for email and password. |
| `playwright.config.ts` (lines 5, 6, 30, 31) | The webServer env passes `ADMIN_EMAIL`/`ADMIN_PASSWORD` instead of `BOOTSTRAP_EMAIL`/`BOOTSTRAP_PASSWORD`; the values come from the shared test account (D6), overridable by real `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars. |
| `tests/integration/*.spec.ts` (five files) | Each spec's `process.env.BOOTSTRAP_EMAIL` / `process.env.BOOTSTRAP_PASSWORD` reads become `process.env.ADMIN_EMAIL` / `process.env.ADMIN_PASSWORD`, with the fixed test account from the shared file (D6) as the fallback. Local const names `OWNER_EMAIL`/`OWNER_PASSWORD` in the specs are renamed to `ADMIN_EMAIL`/`ADMIN_PASSWORD` so one spelling per concept holds even inside `tests/integration/`. |
| `.env.example` (lines 6, 7, 12, 13) | The four lines collapse to one `ADMIN_EMAIL` and one `ADMIN_PASSWORD` line. |
| `README.md` (lines 53, 56, 57, 100, 101, 104, 105, 137, 138, 186) | Rewritten to the two-variable model: setup, deploy (including the new refusal), and a new section for the reset command. |

### D2: The email default is removed, not relocated

In `app/lib/db.server.ts`, `ADMIN_EMAIL` is read with `?? ""` and the
existing `validateEmail` check does the rest: with the password set and the
email unset, server start fails with `ADMIN_EMAIL is invalid: Enter an email
address.` — the same failure class as an invalid email today, and no default
value exists in app code. The silent-skip guard stays on the password
variable only, exactly as it is now.

Alternative considered: skip silently when the email is also unset. Rejected:
it would add a second silent path that the decision record does not confirm,
and an operator who set the password but not the email has made a mistake
that deserves a startup error.

### D3: Deploy refuses before any flyctl call

`scripts/deploy.ts` checks `ADMIN_EMAIL` and `ADMIN_PASSWORD` at the top of
`main()`, before `ensureApp()`. If either is unset it prints an instruction
naming both variables (for example: set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in
the environment or `.env`, then run the deploy again) and exits 1 without
touching flyctl, the app, Postgres, or secrets. With both set, deploy
proceeds as today except that no password is generated or printed, and
`setSecrets` stores the pair as Fly secrets so the app and the reset command
both see them on the machine.

Alternative considered: keep the random-password fallback for fresh installs.
Rejected: confirmed removal; the generated-and-printed password was the
leak-prone path this change closes.

### D4: `scripts/owner-reset.ts` is self-contained

The runtime image does not ship `app/` (only `package.json`, `node_modules`,
`build`, `db`, `server.ts`, and now `scripts/`), and the decision record fixes
exactly one new `COPY` line. The script therefore cannot import
`app/lib/password.ts` or `app/lib/validation.ts` on the machine; it is
self-contained:

- Reads `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` from the environment
  only. It never reads `process.argv` for credentials; a missing variable is
  a hard error naming the variable (unlike the server's silent skip, the
  reset command must not silently do nothing — the operator ran it to
  change something).
- Validates the password with the same 12-to-200 rule as
  `app/lib/validation.ts:132-140` (bounds duplicated, annotated as mirroring
  that file) and rejects out-of-range passwords before any database write.
- Hashes inline with `node:crypto` scrypt using the identical parameters and
  format as `app/lib/password.ts`: `scrypt$16384$8$1$<salt>$<hash>` with
  N=16384, r=8, p=1, 64-byte key, base64url salt and hash. The format string
  is the shared contract: `verifyPassword` at login accepts what the script
  writes.
- Connects with `pg` (a production dependency, present in the runtime image's
  `node_modules`) using the same connection options as `app/lib/db.server.ts`,
  including the `DATABASE_SSL === "true"` option.
- In one transaction: `SELECT count(*) FROM users`; 0 rows → `INSERT INTO
  users (email, password_hash)`; exactly 1 row → `UPDATE users SET email,
  password_hash` (the email is lowercased before writing, matching the
  existing bootstrap and seed behaviour); more than 1 row → print an error
  stating the row count, change nothing, exit 1.
- Never touches the sessions table: a reset changes the credential only, so
  existing sessions remain valid.
- Prints the resulting email only — never the password.

Alternative considered: copy `app/lib/password.ts` into the image and import
it. Rejected: it needs a second `COPY` line (or a broader copy of `app/`),
contradicting the confirmed one-line constraint, and duplicates nothing the
inline version cannot express.

### D5: Runtime image gains `scripts/` with one line

`Dockerfile` gains exactly one line in the runtime stage's copy block
(`Dockerfile` measured lines 16-20), immediately after the existing
`COPY --from=build /app/db ./db` line (line 19 in the decision record's
measurement):

```
COPY --from=build /app/scripts/owner-reset.ts ./scripts/
```

The build stage already contains `scripts/` (its `COPY . .`), so the source
of the copy exists. The single-file form is deliberate: the whole-directory
form would ship `scripts/reset-db.ts`, which drops `users`, `posts`,
`sessions`, and `images` with `CASCADE`, and `scripts/install.ts`, which
rewrites `.env`; both become runnable by anyone with `fly ssh console`. The
owner accepted the consequence: with the single-file form, no script in the
image can import a shared module under `scripts/`, which is why the parity
test exists (see Testing).

`fly ssh console` enters the machine as root, so the script runs as root,
not as the `node` user that runs `server.ts`; it touches only Postgres. The
README must not claim it runs as the `node` user.

### D6: The fixed test account moves to a shared file in `tests/integration/`

`playwright.config.ts` must pass a concrete credential pair to the webServer
environment (the server creates the admin row from it after `reset-db.ts`
wipes the database), but its `owner@example.com` default is one of the five
confirmed removals, and the decision record keeps defaults only in
`tests/integration/` files. Both constraints are met by a new shared module
`tests/integration/test-account.ts` that exports the fixed test account
(`owner@example.com`, `test-owner-password`):

- The five spec files import it as their fallback instead of inlining the
  literals; the `process.env.ADMIN_EMAIL` / `process.env.ADMIN_PASSWORD`
  override mechanism stays.
- `playwright.config.ts` imports it for the webServer env, so the config file
  itself carries no default.

Alternative considered: keep the literals in `playwright.config.ts`. Rejected:
the decision record names `playwright.config.ts:6` as one of the five
defaults that go, and keeps the fixed test account in `tests/integration/`.

### D7: Invocation and script entry

- Local: `package.json` gains `"owner:reset": "node --env-file-if-exists=.env
  scripts/owner-reset.ts"`, following the existing `deploy` and `seed`
  entries. Locally this reads `DATABASE_URL` and the pair from `.env`.
- Fly: `fly ssh console -a oneshot-blog -C "node scripts/owner-reset.ts"`.
  `fly ssh console` enters the machine with its full environment, which
  already contains `DATABASE_URL` (existing secret) and, after D3/D9,
  `ADMIN_EMAIL`/`ADMIN_PASSWORD` (new secrets). No database credential is
  copied to a laptop.

### D8: Docs change in the same commit as the code

Because the server silently skips admin creation when the password variable
is unset, stale two-or-four-variable docs are dangerous: `.env.example` and
`README.md` are edited in this change, not later. The README gains a short
section documenting `npm run owner:reset`, the `fly ssh console` invocation,
and the deploy refusal.

## Risks / Trade-offs

- [Duplicated constants in `owner-reset.ts` (scrypt parameters, 12-200
  bounds) can drift from `app/lib/password.ts` / `app/lib/validation.ts`] →
  each constant is annotated with the file it mirrors; login through
  `verifyPassword` is the acceptance test for format compatibility; a unit
  test can pin the format string.
- [The deploy refusal covers `npm run deploy` only.
  `.github/workflows/deploy.yml:31-35` runs `flyctl deploy
  --remote-only --yes` on a merged pull request; that route reads no
  `ADMIN_EMAIL`/`ADMIN_PASSWORD`, sets no secrets, and cannot refuse. A
  fresh app deployed that way has an empty `users` table and reports
  nothing] → the reset command exits 1 with `ADMIN_PASSWORD is not set.`
  until a laptop `npm run deploy` stores the pair, or the operator runs
  `fly secrets set`. The README documents that order.
- [`scripts/deploy.ts:104-108` stores the deploy-time pair as Fly secrets
  and `scripts/deploy.ts:126-136` posts it to `/internal/seed`: deploying
  from a `.env` written by `npm run setup` puts the local development
  password into the production secrets, the seed request 409s against the
  existing row, and the next reset rotates the production admin account to
  that local password] → the printed line naming the app and the email, plus
  README wording that says to use the production values.
- [An existing production account is not rotated just by setting the new
  secrets — the stored hash was made from the old password] → the migration
  plan (below) makes the reset command the explicit rotation step, and the
  README states it.
- [`tests/integration/test-account.ts` is a new file not listed in the
  decision record's inventory] → it is the mechanical home forced by two
  confirmed constraints (D6); it contains test data only, no product code.
- [Rolling back to the previous image leaves the database rows as-is] → the
  old image's bootstrap skipped in production anyway (it read
  `BOOTSTRAP_PASSWORD`, which was never a Fly secret), and the seed route
  still 409s; the existing admin row and its hash remain valid, so rollback
  is safe.

## Testing

- The reset script exports its hash function and performs no database work
  at import time, so `tests/unit/owner-reset.test.ts` imports it without a
  database: it pins the format `scrypt$16384$8$1$<salt>$<hash>` against
  `verifyPassword` and compares the length verdicts with `validatePassword`
  at 11, 12, 200, and 201 characters.
- `vitest.config.ts` already includes `tests/unit/**/*.test.ts`, and
  `npm run verify` runs it, so the unit test lands inside the existing gate.
- A separate local end-to-end proof resets a local database and signs in
  with the new credential.

## Migration Plan

0. **Read the credential file**: read
   `.env.backup-2026-10-28T21-50-31-334Z`, copy its `OWNER_EMAIL` and
   `OWNER_PASSWORD` out, and keep that file until sign-in with the rotated
   credential passes. No in-app path shows a password and
   `app/routes/seed.tsx:49-51` returns 409 once a user exists, so an early
   delete is unrecoverable.
1. **Local `.env`**: delete `BOOTSTRAP_EMAIL`, `BOOTSTRAP_PASSWORD`,
   `OWNER_EMAIL`, `OWNER_PASSWORD`; set `ADMIN_EMAIL` and `ADMIN_PASSWORD` to
   the same values (the installer always wrote identical values to all four).
   If a hand-edited `.env` diverged across the four, the operator chooses one
   value. `.env.example` shows the two-line form.
2. **Deploy the new code**: the deploy script refuses unless
   `ADMIN_EMAIL`/`ADMIN_PASSWORD` are in the deploying environment or
   `.env`; when they are, it stores them as Fly secrets alongside the
   existing `DATABASE_URL` and `SEED_TOKEN` (additive — no Fly secret is
   renamed or removed). Because `scripts/deploy.ts:104-108` stores the
   deploy-time pair as Fly secrets and `scripts/deploy.ts:126-136` posts it
   to `/internal/seed`, deploying from a `.env` written by `npm run setup`
   puts the local development password into the production secrets, the seed
   request 409s against the existing row, and the next reset rotates the
   production admin account to that local password.
3. **Rotate the production credential**: run
   `fly ssh console -a oneshot-blog -C "node scripts/owner-reset.ts"`. The
   single existing user row is updated to the new email and hash; existing
   sessions keep working.
4. **Verify**: sign in with the new credential; confirm an old session (if
   any) is still authenticated.
5. **Rollback**: redeploy the previous image. The database is untouched by
   this change's schema work (no migration), the admin row persists, and the
   old image runs against it unchanged. Retire the backup file
   `.env.backup-2026-10-28T21-50-31-334Z` only after step 4 passes.

## Open Questions

Two confirmed runtime facts were not verified on this app by measurement
during this review. Both are labelled unverified in this review.

- `fly ssh console` entering the machine as root, which the D5 statement
  that the script runs as root relies on. Unverified in this review.
- The placement check command used for the Dockerfile proof — the command
  that demonstrates the single-file COPY lands where
  `node scripts/owner-reset.ts` finds it. Unverified in this review.
