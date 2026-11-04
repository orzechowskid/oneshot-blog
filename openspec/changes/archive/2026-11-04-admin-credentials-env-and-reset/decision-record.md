# Decision record

Input material for the planning artifacts. These are the decisions the project owner
confirmed in this session. Planning artifacts must carry them; design work must not
contradict them.

Label key: CONFIRMED = the owner said yes. ASSUMPTION = the agent proposed it and the
owner has not judged it.

## Scope

- CONFIRMED: one OpenSpec change covering both the environment-variable consolidation
  and the new admin credential reset command.
- CONFIRMED: the app has a single admin account, now and in future. No multi-user work.
- CONFIRMED: no password change from inside the app. No admin UI for credentials.
- CONFIRMED: `POST /internal/seed` and `SEED_TOKEN` stay in place in this change.
  Removing them is a separate change.

## Names

- CONFIRMED: the surviving environment variables are `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
- CONFIRMED: `BOOTSTRAP_EMAIL`, `BOOTSTRAP_PASSWORD`, `OWNER_EMAIL`, `OWNER_PASSWORD`
  are removed. No fallback read of the old names.
- CONFIRMED: the npm script is `owner:reset` and the file is `scripts/owner-reset.ts`.
- ASSUMPTION: the spec delta capability directory is `admin-credentials`.

## Reset command behaviour

- CONFIRMED: it runs inside the Fly machine, invoked as
  `fly ssh console -a oneshot-blog -C "node scripts/owner-reset.ts"`.
  `DATABASE_URL` is already in that machine's environment, so no database credential is
  copied to a laptop.
- CONFIRMED: the runtime image gains `scripts/`, so `Dockerfile` gains one
  `COPY --from=build /app/scripts ./scripts` line after line 19.
- CONFIRMED: it writes both `users.email` and `users.password_hash`.
- CONFIRMED: when `users` holds zero rows it inserts; when it holds one row it updates;
  when it holds more than one row it stops with an error and changes nothing.
- CONFIRMED: the password is read from the environment only, never from argv, because
  argv is visible in shell history and in the process list.
- Existing sessions are left untouched. A reset does not log anyone out.

## Behaviour changes agreed with the rename

- CONFIRMED: `scripts/deploy.ts` stops generating a random password when the credential
  variable is absent, and stops printing a generated password. It refuses to deploy and
  prints a clear instruction naming `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
- CONFIRMED: no `owner@example.com` default in app code or scripts. The four current
  defaults are at `app/lib/db.server.ts:55`, `scripts/deploy.ts:14`, `scripts/seed.ts:3`,
  `playwright.config.ts:6`. Defaults stay in `tests/integration/` files, where a fixed
  test account is intended.

## Files that carry the four old names

Measured with `git ls-files | xargs grep -c 'BOOTSTRAP_\|OWNER_'`:

| File | Matches |
|---|---|
| `.env.example` | 4 (lines 6, 7, 12, 13) |
| `README.md` | 10 (lines 53, 56, 57, 100, 101, 104, 105, 137, 138, 186) |
| `app/lib/db.server.ts` | 4 (lines 47, 52, 55, 58) |
| `playwright.config.ts` | 4 (lines 5, 6, 30, 31) |
| `scripts/deploy.ts` | 3 (lines 14, 16, 169) |
| `scripts/install.ts` | 7 (lines 260, 272, 273, 276, 277, 321, 322) |
| `scripts/seed.ts` | 3 (lines 3, 4, 10) |
| `tests/integration/adminlist.spec.ts` | 5 |
| `tests/integration/autosave.spec.ts` | 5 |
| `tests/integration/blog.spec.ts` | 6 |
| `tests/integration/draft-editing.spec.ts` | 5 |
| `tests/integration/publish.spec.ts` | 5 |

Supporting facts:

- `scripts/install.ts:272-277` writes one `email` value and one `password` value into all
  four variables. The four names describe one set of values.
- There are five `owner@example.com` defaults, not four: `app/lib/db.server.ts:55`,
  `scripts/deploy.ts:14`, `scripts/seed.ts:3`, `playwright.config.ts:6`, and
  `scripts/install.ts:260` (`askEmail("Owner email", "owner@example.com")`).
- `.github/workflows/deploy.yml:31-35` deploys merged pull requests with
  `flyctl deploy --remote-only --yes`. That route never runs `scripts/deploy.ts`, so it
  reads no credential variable, sets no secret, and cannot reach the new refusal.
- `scripts/deploy.ts:104-108` stores secrets with `fly secrets set`; `scripts/deploy.ts:126-136`
  posts the pair to `/internal/seed`. The pair present at deploy time therefore becomes the
  production credential path.
- `.dockerignore` excludes `tests` and `.env*`, not `scripts`, so the build stage contains
  `scripts/`.
- `vitest.config.ts` includes `tests/unit/**/*.test.ts`, and `npm run verify` runs
  `npm run test`, so a unit test for the reset script lands inside the existing gate.
  `tsconfig.json` includes `scripts` and `tests`, so `npm run typecheck` covers new files
  there. No unit test imports `app/lib/db.server.ts`. The integration baseline is 52 tests
  in 5 files.
- `fly ssh console` enters the machine as root. The reset script runs as root, not as the
  `node` user that runs `server.ts`.
- `app/lib/db.server.ts:46-71` inserts the admin row only when
  `SELECT count(*) FROM users` returns 0, and returns early when the password variable is
  unset. That early return is silent, which is why `.env.example` and README must change in
  the same change as the code.
- `app/routes/seed.tsx:49-51` returns 409 when any user exists, so the seed route cannot
  rotate a credential.
- `app/lib/validation.ts:132-140` requires 12 to 200 characters for a password.
- `Dockerfile` lines 16-20 copy `package.json`, `node_modules`, `build`, `db`,
  `server.ts` into the runtime image. `scripts/` is absent.
- Production Fly app `oneshot-blog` currently has two secrets: `DATABASE_URL`,
  `SEED_TOKEN`. The new pair is additive. Nothing in Fly secrets needs renaming.
- `openspec/specs` is empty. This change adds the project's first capability.

## Second-round decisions (CONFIRMED)

Taken after a review pass on the first draft of these artifacts.

- CONFIRMED: the runtime image gains only the reset script, with
  `COPY --from=build /app/scripts/owner-reset.ts ./scripts/` in the runtime stage, after
  `COPY --from=build /app/db ./db`. Not the whole `scripts/` directory, because
  `scripts/reset-db.ts` drops `users`, `posts`, `sessions`, and `images` with `CASCADE`, and
  `scripts/install.ts` rewrites `.env`; both would be runnable by anyone with
  `fly ssh console`.
- CONFIRMED: the GitHub Actions deploy route is documented in `README.md`, with the
  `fly secrets set` command an operator runs to give the machine the pair. No change to
  `.github/workflows/deploy.yml`.
- CONFIRMED: `npm run deploy` keeps storing `ADMIN_EMAIL` and `ADMIN_PASSWORD` as Fly
  secrets, and prints a line naming the app and the email it is storing, so the moment a
  deploy writes a production credential is visible to the person running it.
- CONFIRMED: `app/lib/validation.ts:134` changes from "Use at least 12 characters for the
  owner password." to "Use at least 12 characters for the admin password."
- CONFIRMED: the five `owner@example.com` defaults, including `scripts/install.ts:260`, all
  go.
- CONFIRMED: the reset script exports its hash function and does no database work at import
  time, so a unit test can assert the format `scrypt$16384$8$1$<salt>$<hash>` against
  `verifyPassword`, and assert the 12-to-200 verdicts against `validatePassword`.
- CONFIRMED: the plan carries a local end-to-end proof of the reset command: reset a local
  database, sign in with the new credential, reset again, and confirm one row updated.
- CONFIRMED: searches for the removed names and for `owner@example.com` are scoped to
  `app/`, `scripts/`, `playwright.config.ts`, `.env.example`, `README.md`. The change's own
  Markdown deliberately names the removed variables, so an unscoped repo search can never
  pass.
- CONFIRMED: `app/lib/db.server.ts` and `playwright.config.ts` land in one commit.
  Splitting them leaves every integration test failing at login.
- CONFIRMED: the README section for `npm run owner:reset` is written after the script and
  its npm entry exist.
- CONFIRMED: the migration plan starts by reading the credential file
  `.env.backup-2026-10-28T21-50-31-334Z` and keeps it until sign-in with the rotated
  credential succeeds. An early delete is unrecoverable: no in-app path shows a password and
  `app/routes/seed.tsx:49-51` returns 409 once a user exists.

## Verification

- `npm run verify` runs typecheck, unit tests, and build.
- `npm run test:integration` runs Playwright specs that use the test owner credentials.
- The rename is complete when
  `grep -rn 'BOOTSTRAP_\|OWNER_' app scripts playwright.config.ts .env.example README.md`
  returns no match, and
  `grep -rn 'owner@example.com' app scripts playwright.config.ts .env.example README.md`
  returns no match. Do not use `git ls-files`: it skips untracked files, and the change's own
  Markdown names the removed variables.

## Decisions taken by the agent during implementation (unattended)

Taken during implementation, under the owner's delegation for this run. Each item is an
agent decision, not a new owner confirmation.

- AGENT: the five fixture email strings in `app/lib/validation.test.ts` move from the old
  `owner@example.com` placeholder to `reader@example.com`, and one mixed-case form input in
  the same file moves with them. The validation rule under test is unchanged, so behaviour
  is unchanged.
- AGENT: seed-route fixture data under `tests/integration/` keeps its own addresses,
  including `second-owner@example.com`. The cleanup search for the removed names and for
  `owner@example.com` is scoped to app code, scripts, the test config, the example env file,
  and the README, so fixture files are not a search target.
- AGENT: the per-file proof wording in `tasks.md` was corrected to match the requirement
  scope. The task assertions are unchanged.
- AGENT: no production action was taken in this run: nothing deployed, no Fly secret set,
  no reset run against the live site, and no saved credential file touched. The migration
  plan in the second-round section still applies.
