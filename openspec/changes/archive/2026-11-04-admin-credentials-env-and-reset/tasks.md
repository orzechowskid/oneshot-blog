# Tasks: admin-credentials-env-and-reset

Order: 1.1, 2.1, 2.2, 2.3, 3.1, 3.2 are sequential. Land 1.1 and 3.2 in the same commit: `app/lib/db.server.ts` reads `ADMIN_PASSWORD` and `playwright.config.ts:30-31` is the only writer of it for the integration run, so splitting them leaves all 52 integration tests failing at login. 4.1-4.5 are parallel and run after 3.2. The README task for `npm run owner:reset` runs after the script and its npm entry exist.

Each task names exactly one file, the assertion that file must satisfy, and one command that proves it.

## 1. App rename

- [x] 1.1 `app/lib/db.server.ts`: bootstrap reads only `ADMIN_PASSWORD` (silent early return when unset, unchanged) and `ADMIN_EMAIL` (no `owner@example.com` default; unset email with password set fails the existing email validation), and both error messages name the new variables. Prove with: `grep -n 'ADMIN_EMAIL\|ADMIN_PASSWORD\|INSERT INTO users' app/lib/db.server.ts` — expect at least 5 matches, at least two naming `ADMIN_EMAIL` and at least two naming `ADMIN_PASSWORD`.

## 2. Script renames (sequential)

- [x] 2.1 `scripts/deploy.ts`: reads required `ADMIN_EMAIL`/`ADMIN_PASSWORD` (no default, no random generation), refuses before any flyctl call when either is unset and prints an instruction naming both variables, no password is ever printed, prints one line naming the app and the email whose credential it stores as a Fly secret, and `setSecrets` stores `ADMIN_EMAIL` and `ADMIN_PASSWORD` with `fly secrets set` without changing `SEED_TOKEN` or `DATABASE_URL`. Prove with: `env -u ADMIN_EMAIL -u ADMIN_PASSWORD node scripts/deploy.ts` — expect the refusal message naming both variables and exit 1, with no flyctl invocation. Also: `grep -c 'ADMIN_EMAIL\|ADMIN_PASSWORD' scripts/deploy.ts` — expect at least 3.
- [x] 2.2 `scripts/seed.ts`: reads required `ADMIN_EMAIL`/`ADMIN_PASSWORD`, a missing variable throws `ADMIN_PASSWORD is required.` (same shape for `ADMIN_EMAIL`), and the 409 handling is unchanged. Prove with: `env -u ADMIN_PASSWORD SEED_TOKEN=t ADMIN_EMAIL=a@b.co node scripts/seed.ts` — expect exit 1 and the message `ADMIN_PASSWORD is required.`, with no network request.
- [x] 2.3 `scripts/install.ts`: both the local and Fly modes write exactly `ADMIN_EMAIL` and `ADMIN_PASSWORD` (the four old entries collapse to the pair), still asking once for email and password, and the `askEmail` prompt at line 260 keeps no `owner@example.com` default. Prove with: `grep -n 'BOOTSTRAP_\|OWNER_\|owner@example.com' scripts/install.ts` — expect no match. Also: `grep -c 'ADMIN_EMAIL\|ADMIN_PASSWORD' scripts/install.ts` — expect 4.

## 3. Test infrastructure

- [x] 3.1 `tests/integration/test-account.ts` (new, per design D6): exports the fixed test account (`owner@example.com`, `test-owner-password`) as the named constants `ADMIN_EMAIL` and `ADMIN_PASSWORD`; the file name does not match the Playwright test pattern, so it is a plain module, not a test. Prove with: `node --input-type=module -e "import('./tests/integration/test-account.ts').then(m=>console.log(m.ADMIN_EMAIL,m.ADMIN_PASSWORD))"` — expect `owner@example.com test-owner-password`.
- [x] 3.2 `playwright.config.ts`: the webServer env passes `ADMIN_EMAIL`/`ADMIN_PASSWORD` sourced from `tests/integration/test-account.ts`, overridable by real `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars, and the config file itself contains no default. Land in the same commit as 1.1 (see Order). Prove with: `grep -n 'BOOTSTRAP_\|OWNER_\|owner@example.com' playwright.config.ts` — expect no match. Also: `grep -c 'ADMIN_EMAIL\|ADMIN_PASSWORD' playwright.config.ts` — expect at least 2.

## 4. Integration spec files (4.1-4.5 are parallel; run after 3.2)

Measured baseline: `npx playwright test --list` reports 52 tests in 5 files. Every spec keeps its login steps, so a deleted login step shows up as a count change. Fixture data under `tests/integration/` may contain the string `owner@example.com` (the seed-route tests use `second-owner@example.com`), and the authoritative search for that string is task 7.3.

- [x] 4.1 `tests/integration/adminlist.spec.ts`: reads credentials from `process.env.ADMIN_EMAIL`/`process.env.ADMIN_PASSWORD` with the shared test account as fallback; local consts are named `ADMIN_EMAIL`/`ADMIN_PASSWORD`. Prove with: `grep -c 'ADMIN_EMAIL\|ADMIN_PASSWORD' tests/integration/adminlist.spec.ts` — expect at least 2. Also: `grep -n 'BOOTSTRAP_\|OWNER_\|test-owner-password' tests/integration/adminlist.spec.ts` — expect no match. Group proof: `npx playwright test --list` — expect 52 tests in 5 files.
- [x] 4.2 `tests/integration/autosave.spec.ts`: same assertion as 4.1 for this file. Prove with: `grep -c 'ADMIN_EMAIL\|ADMIN_PASSWORD' tests/integration/autosave.spec.ts` — expect at least 2. Also: `grep -n 'BOOTSTRAP_\|OWNER_\|test-owner-password' tests/integration/autosave.spec.ts` — expect no match. Group proof: `npx playwright test --list` — expect 52 tests in 5 files.
- [x] 4.3 `tests/integration/blog.spec.ts`: same assertion as 4.1 for this file. Prove with: `grep -c 'ADMIN_EMAIL\|ADMIN_PASSWORD' tests/integration/blog.spec.ts` — expect at least 2. Also: `grep -n 'BOOTSTRAP_\|OWNER_\|test-owner-password' tests/integration/blog.spec.ts` — expect no match. Group proof: `npx playwright test --list` — expect 52 tests in 5 files.
- [x] 4.4 `tests/integration/draft-editing.spec.ts`: same assertion as 4.1 for this file. Prove with: `grep -c 'ADMIN_EMAIL\|ADMIN_PASSWORD' tests/integration/draft-editing.spec.ts` — expect at least 2. Also: `grep -n 'BOOTSTRAP_\|OWNER_\|test-owner-password' tests/integration/draft-editing.spec.ts` — expect no match. Group proof: `npx playwright test --list` — expect 52 tests in 5 files.
- [x] 4.5 `tests/integration/publish.spec.ts`: same assertion as 4.1 for this file. Prove with: `grep -c 'ADMIN_EMAIL\|ADMIN_PASSWORD' tests/integration/publish.spec.ts` — expect at least 2. Also: `grep -n 'BOOTSTRAP_\|OWNER_\|test-owner-password' tests/integration/publish.spec.ts` — expect no match. Group proof: `npx playwright test --list` — expect 52 tests in 5 files.

## 5. Reset command (sequential)

- [x] 5.1 `scripts/owner-reset.ts` (new, per design D4): reads `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` from the environment only (never argv) and errors naming the variable when one is missing; enforces the 12-to-200 password rule before any write; inserts when `users` has 0 rows, updates the single row when it has 1, refuses with an error and no change when it has more than 1; hashes with the `scrypt$16384$8$1$<salt>$<hash>` format; never touches sessions; never prints the password; exports the hash function for unit testing and does no database work at import time. Prove with: `env -u DATABASE_URL -u ADMIN_EMAIL -u ADMIN_PASSWORD node scripts/owner-reset.ts` — expect an error naming the missing variable and exit 1.
- [x] 5.2 `package.json`: gains the entry `"owner:reset": "node --env-file-if-exists=.env scripts/owner-reset.ts"` following the existing `deploy`/`seed` pattern. Prove with: `node -e "console.log(require('./package.json').scripts['owner:reset'])"` — expect it to print the entry.
- [x] 5.3 `Dockerfile`: gains exactly one line in the runtime stage, `COPY --from=build /app/scripts/owner-reset.ts ./scripts/`, immediately after `COPY --from=build /app/db ./db` (measured `Dockerfile:21`). The single file, not the `scripts/` directory: `scripts/reset-db.ts` drops `users`, `posts`, `sessions`, `images` with CASCADE and `scripts/install.ts` rewrites `.env`; neither ships. Prove with: `awk '/AS runtime/,0' Dockerfile | grep -c 'COPY --from=build /app/scripts'` — expect exactly 1.
- [x] 5.4 `app/lib/validation.ts` and `app/lib/validation.test.ts`: line 134 changes from "Use at least 12 characters for the owner password." to "Use at least 12 characters for the admin password." Check whether any test file asserts the old string and update it if so (`app/lib/validation.test.ts:102` currently does). The five fixture email strings in `app/lib/validation.test.ts` move to `reader@example.com`, including the mixed-case form input that lowercases to the old placeholder. Prove with: `grep -c 'admin password' app/lib/validation.ts` — expect 1. Also: `npm run verify` — expect green.
- [x] 5.5 `tests/unit/owner-reset.test.ts` (new): imports the exported hash function from `scripts/owner-reset.ts`, asserts the output matches `/^scrypt\$16384\$8\$1\$[^$]+\$[^$]+$/`, asserts `verifyPassword(password, hash)` is true at 12 and 200 characters, and asserts the script's length verdicts equal `validatePassword`'s at 11, 12, 200, 201. Prove with: `npx vitest run tests/unit/owner-reset.test.ts` — expect pass.
- [x] 5.6 End-to-end local proof of the reset command: run `npm run db:up && npm run build && node --env-file-if-exists=.env scripts/reset-db.ts && env ADMIN_EMAIL=rotate@example.com ADMIN_PASSWORD=rotate-password-12 node --env-file-if-exists=.env scripts/owner-reset.ts` — expect it prints `rotate@example.com` with exit 0, and sign-in at `http://127.0.0.1:3000` (server started in the background, e.g. `npm start`) succeeds with that pair; run the reset again with a second password and expect the same single row updated. The `--env-file-if-exists=.env` flag is required on both script invocations because these scripts read environment variables at import time.

## 6. Docs

- [x] 6.1 `.env.example`: a single `ADMIN_EMAIL`/`ADMIN_PASSWORD` pair with placeholder values (not `owner@example.com`), all four old lines removed. Prove with: `grep -n 'BOOTSTRAP_\|OWNER_\|owner@example.com' .env.example` — expect no match. Also: `grep -c '^ADMIN_EMAIL=\|^ADMIN_PASSWORD=' .env.example` — expect 2.
- [x] 6.2 `README.md`: rewritten to the two-variable model, documenting the deploy refusal and the GitHub Actions deploy route, with the `fly secrets set` command an operator runs to give the machine the pair, and no old variable names and no `owner@example.com` literal. Prove with: `grep -n 'BOOTSTRAP_\|OWNER_\|owner@example.com' README.md` — expect no match. Also: `grep -c 'ADMIN_EMAIL' README.md` — expect at least 4 (estimate).
- [x] 6.3 `README.md`: gains the section for the reset command (`npm run owner:reset` and `fly ssh console -a oneshot-blog -C "node scripts/owner-reset.ts"`). Runs after 5.1 and 5.2 exist (see Order). Prove with: `grep -c 'owner:reset' README.md` — expect at least 1.

## 7. Final verification

- [x] 7.1 Run `npm run verify` — expect exit 0 (typecheck, unit tests, and build all pass with the renamed code, the new script, and the new unit test).
- [x] 7.2 Run `npm run test:integration` — expect all 52 tests in 5 files to pass, proving the test account flows from the shared module through the webServer env into server-side admin creation and login.
- [x] 7.3 Final rename check: run `grep -rn 'BOOTSTRAP_\|OWNER_' app scripts tests playwright.config.ts .env.example README.md` — expect no match. Run `grep -rn 'owner@example.com' app scripts playwright.config.ts .env.example README.md` — expect no match; fixture data under `tests/integration/` is allowed. Do not use `git ls-files`: it skips the two new untracked files, `scripts/owner-reset.ts` and `tests/unit/owner-reset.test.ts`, and the change's own Markdown names the removed variables.

## Verification evidence

The rename wave evidence is in `wave1-verification.md`; the final gate evidence is in `wave2-verification.md`.

Measured final gate numbers:
- Unit tests: 111 passed in 11 test files (`npm run verify`, exit 0).
- Integration tests: 52 passed in 5 files, 0 failed (`npm run test:integration`, exit 0).
- Deploy refusal: exit 1, message `Set ADMIN_EMAIL and ADMIN_PASSWORD in the environment or .env, then run the deploy again.`
- Seed refusal (password unset): exit 1, message `Error: ADMIN_PASSWORD is required.` (thrown before any network request).
- Reset missing-variable refusal: exit 1, message `DATABASE_URL is not set.`
- More-than-one-row refusal: exit 1, message `Refusing to reset: the users table has 2 rows. Expected at most 1 row. Nothing was changed.` (row count: 2; the table is unchanged before and after).

Image check: the runtime image's `scripts/` directory contains the reset script only, the image working directory is the app directory, the script imports with no environment read, and it runs from the image with a plain node invocation.

End-to-end reset proof: the reset inserts on an empty table, updates the single row in place on the second run, sign-in with the rotated password returns the redirect and the session cookie, the old password is rejected, and a too-short password is refused with the row untouched.

No production action was taken: nothing deployed, no secret set, no reset run against the live site, no saved credential file touched.
