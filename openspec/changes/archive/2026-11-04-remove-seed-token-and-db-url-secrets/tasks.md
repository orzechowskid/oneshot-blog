# Tasks: remove-seed-token-and-db-url-secrets

All commands run from the repository root (`/home/dan/repos/oneshot-blog`).
Line numbers refer to the files before this change; they match design.md.
After an earlier task deletes lines, locate the target by its content.
Each task names exactly one file, the assertion that file must satisfy, and
one verification command.

Order and parallelism:

- 1.1, 1.3, 2.1, 2.2, 5.2, 6.1, and 7.1 touch disjoint files and may run
  in parallel with each other.
- Section 1: 1.4 runs after 1.2, because while `app/routes/seed.tsx` still
  exists it imports the two functions 1.4 deletes, so 1.4's typecheck fails
  until 1.2 deletes the route.
- Section 3 runs in order 3.1, 3.2, 3.3, 3.4, 3.5: tasks 3.1 to 3.4 edit the
  same file, and 3.5 imports the exports that 3.3 and 3.4 create (the guard
  in 3.4 is what makes the import side-effect free).
- Section 4 runs in order 4.1, 4.2: both edit `scripts/install.ts`.
- Section 5: 5.1 and 5.3 run in order (both edit `.env.example`); 5.2 may
  run in parallel with either.
- Section 8 is verification, not implementation. Run it last, after every
  task in sections 1 to 7 is checked.
- No task deploys, runs `flyctl`, or contacts a deployed app. The production
  `SEED_TOKEN` unset is an operator action after this change (decision
  record, decision 9) and is not a task here.

## 1. Delete the seed route

- [x] 1.1 `app/routes.ts`: remove the `route("internal/seed", "routes/seed.tsx")` line (line 15); no other change. Prove with: `! grep -n "internal/seed" app/routes.ts && npm run typecheck` — expect grep to print no line and tsc to print no errors (exit 0). Report: the command, its exit status, and the lines it printed (none).
- [x] 1.2 `app/routes/seed.tsx`: delete the whole file. Prove with: `test ! -f app/routes/seed.tsx && echo "PASS: app/routes/seed.tsx deleted"` — expect the printed line `PASS: app/routes/seed.tsx deleted` (exit 0). Report: the printed line. 1.1 and 1.2 may run in parallel.
- [x] 1.3 `app/routes/admin-autosave.tsx`: repoint the comment at line 13, which ends `(see seed.tsx)`, to `app/routes/image.tsx` (design D5); the line becomes `// the client only when the action returns a raw Response (see app/routes/image.tsx).` and no other change. Prove with: `! grep -n "seed" app/routes/admin-autosave.tsx` — expect no printed line and exit 0. Report: the command and its exit status.
- [x] 1.4 `app/lib/posts.server.ts`: delete the now-unused `countUsers` function (lines 437-443) and `createOwner` function (lines 445-451), the blank lines at lines 444 and 452, and the now-unused `import { hashPassword } from "./password";` line (line 2; its only use in this file is in `createOwner`) (design D5). Their only consumer is `app/routes/seed.tsx`, which task 1.2 deletes. Prove with: `! grep -nE "countUsers|createOwner|hashPassword" app/lib/posts.server.ts && npm run typecheck` — expect grep to print no line and tsc to print no errors (exit 0). Report: the command, its exit status, and the lines it printed (none). 1.4 runs after 1.2 (see Order and parallelism).

## 2. Delete the seed script and its npm entry

- [x] 2.1 `scripts/seed.ts`: delete the whole file. Prove with: `test ! -f scripts/seed.ts && echo "PASS: scripts/seed.ts deleted"` — expect the PASS line (exit 0). Report: the printed line.
- [x] 2.2 `package.json`: remove the `"seed": "node --env-file-if-exists=.env scripts/seed.ts"` entry (line 25); no other change; the file must stay valid JSON. Prove with: `node -e "const p=JSON.parse(require('node:fs').readFileSync('package.json','utf8')); if (Object.hasOwn(p.scripts,'seed')) process.exit(1); console.log('PASS: package.json valid, no seed script')"` — expect the PASS line (exit 0). Report: the printed line. 2.1 and 2.2 may run in parallel.

## 3. Deploy script: no seeding, admin-pair secrets, attach decision, and its unit test

The deploy script and its new unit test are in this section. Tasks 3.1 to 3.4 are sequential (same file); 3.5 runs after 3.4.

- [x] 3.1 `scripts/deploy.ts`: delete the seeding path — the `randomBytes` import (line 1), the `seedToken` constant (lines 14-15), the `SEED_TOKEN=${seedToken}` entry in `setSecrets` (line 105), the `seedOwner()` function (lines 130-151), its call in `main()` (line 177), and the token print (line 181). Keep the blank-line print (line 179) and the `Deployed:` print (line 180). Prove with: `! grep -nE "SEED_TOKEN|randomBytes|seedOwner|internal/seed" scripts/deploy.ts && npm run typecheck` — expect grep to print no line and tsc to print no errors (exit 0). Report: the command, its exit status, and the lines it printed (none).
- [x] 3.2 `scripts/deploy.ts`: fix the secret list to the admin pair only — in `setSecrets`, delete the `if (databaseUrl) secrets.push(...)` line (line 107); delete the module-level `const databaseUrl = process.env.DATABASE_URL;` (line 18); delete the `if (databaseUrl) { ... return; }` gate in `ensurePostgres()` (lines 71-75); drop the `true` argument from the attach call (line 98) so a failed attach fails the deploy. Prove with: `! grep -nE "databaseUrl|attach.*true" scripts/deploy.ts && npm run typecheck` — expect grep to print no line and tsc to print no errors (exit 0). Report: the command, its exit status, and the lines it printed (none).
- [x] 3.3 `scripts/deploy.ts`: implement the attach decision from the deployed app's secret names (design D3) and export the decision functions (design D1). Declare both with `export function`. Export `buildDeploySecrets(adminEmail: string, adminPassword: string): string[]`, returning exactly `["ADMIN_EMAIL=${adminEmail}", "ADMIN_PASSWORD=${adminPassword}"]` (move the list construction out of `setSecrets`, which calls it). Export `shouldAttachPostgres(deployedSecretNames: string[]): boolean`, returning `true` only when `"DATABASE_URL"` is not in the list. Add a private helper that lists the deployed app's secret names with `fly secrets list --app <app> --json` (the app name is the existing `appName` constant) and extracts each entry's name. When the list command exits non-zero, its output does not parse as JSON, or the parsed JSON is not an array, the deploy script refuses: it prints a message naming the exact command the operator runs by hand (`fly secrets list --app <app> --json`), changes nothing, writes no secret, and exits with status 1; an empty list is a valid read, not a failure, and means the attach step runs (design D3). In the database step, list the deployed secret names first: when `DATABASE_URL` is absent, keep the existing Postgres cluster existence check and creation and run the attach; when it is present, change nothing about the database. Prove with: `npm run typecheck && test "$(grep -cE 'export function (buildDeploySecrets|shouldAttachPostgres)\(' scripts/deploy.ts)" = "2" && echo "PASS: both decision functions exported"` — expect the PASS line (exit 0). Report: the printed line.
- [x] 3.4 `scripts/deploy.ts`: make the module importable without side effects (design D1) — replace the unconditional `main().catch(...)` at the end of the file with the entry-point guard used in `scripts/owner-reset.ts` (lines 111-113), exactly `const isEntry = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;` — without the `undefined` check, `pathToFileURL(undefined)` throws under `node -e` — and run `main()` only when `isEntry` is true (add `import { pathToFileURL } from "node:url";`). Prove with: `env -u ADMIN_EMAIL -u ADMIN_PASSWORD -u FLY_API_TOKEN -u DATABASE_URL node --input-type=module -e "const m = await import('file://' + process.cwd() + '/scripts/deploy.ts'); console.log('PASS: import side-effect free. exports:', Object.keys(m).sort().join(', '))"` — the `env -u` flags scrub the deploy credentials from the proof environment, because importing the current unguarded script runs a real deploy on this machine. Expect before the change: exit 1 with the credential-refusal line and no flyctl call. Expect after the change: exit 0, the PASS line listing exactly `buildDeploySecrets, shouldAttachPostgres`, and no flyctl output. Report: the printed line and the exit status.
- [x] 3.5 `tests/unit/deploy.test.ts` (new file): the unit tests of design D7. Import the decision functions from `../../scripts/deploy` (safe: the guard in 3.4 means the import runs no deploy) and assert: (a) `buildDeploySecrets("deploy-test@example.com", "a-long-password")` returns exactly `["ADMIN_EMAIL=deploy-test@example.com", "ADMIN_PASSWORD=a-long-password"]`, and with `process.env.DATABASE_URL` set to a local development value for the duration of the test (restored after), no returned entry starts with `DATABASE_URL=` or `SEED_TOKEN=`; (b) `shouldAttachPostgres(["ADMIN_EMAIL", "ADMIN_PASSWORD"])` is `true`, `shouldAttachPostgres(["ADMIN_EMAIL", "ADMIN_PASSWORD", "DATABASE_URL"])` is `false`, and `shouldAttachPostgres([])` is `true`; (c) no seeding step is reachable: the module's sorted export list equals `["buildDeploySecrets", "shouldAttachPostgres"]`, so no seed function and no token value is exported. Prove with: `npx vitest run tests/unit/deploy.test.ts` — expect `Test Files  1 passed (1)` and `Tests  N passed (N)` with N at least 3 and 0 failed. Report: the vitest summary lines.

## 4. Installer stops writing the seed token and APP_URL

- [x] 4.1 `scripts/install.ts`: stop writing the seed token — delete the `generateToken()` function (lines 131-133), the `const seedToken = generateToken();` line (line 262), and both `["SEED_TOKEN", seedToken]` entries (lines 274 and 321). Keep `generatePassword()`, the `randomBytes` import (still used by `generatePassword()`), the local development `DATABASE_URL` writes, and the `APP_URL` entries (4.2 deletes them). Prove with: `! grep -nE "SEED_TOKEN|seedToken|generateToken" scripts/install.ts && npm run typecheck` — expect grep to print no line and tsc to print no errors (exit 0). Report: the command, its exit status, and the lines it printed (none).

- [x] 4.2 `scripts/install.ts`: stop writing `APP_URL` — delete both `APP_URL` entries (lines 275 and 322); the installer keeps writing the local development `DATABASE_URL` (design D5). Prove with: `! grep -n "APP_URL" scripts/install.ts && npm run typecheck` — expect grep to print no line and tsc to print no errors (exit 0). Report: the command, its exit status, and the lines it printed (none). 4.1 and 4.2 run in order (same file).

## 5. Drop the seed token and APP_URL from the environment example and the integration harness

- [x] 5.1 `.env.example`: remove the `SEED_TOKEN=replace-with-a-long-random-token` line (line 9). Prove with: `! grep -n "SEED_TOKEN" .env.example` — expect no printed line and exit 0. Report: the command and its exit status.
- [x] 5.2 `playwright.config.ts`: remove the `SEED_TOKEN: "integration-test-seed-token",` web server env entry (line 34). Prove with: `! grep -n "SEED_TOKEN" playwright.config.ts && npm run typecheck` — expect grep to print no line and tsc to print no errors (exit 0). Report: the command, its exit status, and the lines it printed (none). 5.2 may run in parallel with 5.1 and 5.3.
- [x] 5.3 `.env.example`: remove the `APP_URL=http://127.0.0.1:3000` line (line 10) (design D5). Prove with: `! grep -n "APP_URL" .env.example` — expect no printed line and exit 0. Report: the command and its exit status. 5.1 and 5.3 run in order (same file).

## 6. Remove the seed-endpoint tests from the integration suite

- [x] 6.1 `tests/integration/blog.spec.ts`: delete the `const SEED_TOKEN = "integration-test-seed-token";` line (line 8) and the two seed-endpoint tests `the seed endpoint rejects a second owner` and `the seed endpoint rejects a bad token` (lines 186-214); every other test stays. Prove with: `! grep -nE "SEED_TOKEN|internal/seed" tests/integration/blog.spec.ts && npm run typecheck && test "$(grep -c '^test(' tests/integration/blog.spec.ts)" = "10" && echo "PASS: 10 tests remain, no seed references"` — expect the PASS line (exit 0; the file currently holds 12 tests). Report: the printed line.

## 7. Update the README to match the code

- [x] 7.1 `README.md`: remove the seed mentions and state the attach rule in the deploy description (decision 8). Delete: the phrase "and a generated `SEED_TOKEN`" in the installer bullet (line 21); the words "and `SEED_TOKEN`" in the installer paragraph (line 24; the sentence then reads "The installer writes the owner password to `.env`; it does not print the secret."); the words "and `npm run seed`" in the npm scripts paragraph; the `npm run seed` row of the commands table; the description of the `npm run deploy` row of the commands table (line 87, which says "Create or update the Fly.io app, database, secrets, and owner account") becomes "Create or update the Fly.io app, check the Postgres attachment, and set the admin credential secrets"; the `SEED_TOKEN` row of the environment variables table (line 103); the `APP_URL` row of the environment variables table (line 104, deleted whole) (design D5); the word "seed" in the Used-by cells of `ADMIN_EMAIL` and `ADMIN_PASSWORD` ("Server, deploy, seed, reset" becomes "Server, deploy, reset"); the words "seed endpoint behavior," in the integration tests paragraph; the phrase ", and the seed route refuses to create a second account once a user exists" in the admin credential reset paragraph; and the security note "The seed endpoint requires `SEED_TOKEN` and refuses to create a second owner." (line 269). Rewrite the deploy steps: step 2 becomes the attach rule — the deploy lists the deployed app's secret names, and only when `DATABASE_URL` is absent there does it create the Postgres app (if missing) and attach it; when the secret is present the deploy changes nothing about the database; step 4 becomes "Sets `ADMIN_EMAIL` and `ADMIN_PASSWORD` as Fly secrets." with no `SEED_TOKEN` and no `DATABASE_URL`; delete step 7 (the seed step) and renumber the remaining steps; and add one sentence to the deploy section stating that the deploy writes no `DATABASE_URL` secret and that the only mechanism that sets the deployed app's database address is `fly postgres attach`. Prove with: `! grep -nEi "seed|APP_URL" README.md` — expect no printed line and exit 0. Report: the command and its exit status.

## 8. Verification (final gate)

Verification only, not implementation. Run after every task in sections 1 to 7 is checked.

- [x] 8.1 Run `npm run verify` — expect: `tsc --noEmit` prints no errors; vitest prints `Test Files  X passed (X)` and `Tests  Y passed (Y)` with 0 failed, including `tests/unit/deploy.test.ts`; `react-router build` completes (it also regenerates `.react-router/types`, dropping the stale `/internal/seed` entry); exit 0. Report: the vitest summary lines and the exit status.
- [x] 8.2 Run `npm run db:up && npm run test:integration` — expect: Playwright reports 50 passed and 0 failed across the 5 spec files (the measured 52-test baseline minus the 2 removed seed tests), and no seed-endpoint test appears in the output. Report: the Playwright summary line.
- [x] 8.3 Run `grep -rn "SEED_TOKEN" app/ scripts/ playwright.config.ts .env.example package.json README.md` — expect no printed line and exit status 1 (no match). Report: the exit status.
- [x] 8.4 Run `grep -rn "internal/seed" app/ scripts/ playwright.config.ts .env.example package.json README.md` — expect no printed line and exit status 1 (no match). Report: the exit status.

## Verification evidence

The measured results are in `/home/dan/repos/oneshot-blog/openspec/changes/remove-seed-token-and-db-url-secrets/verification.md`. No deployed app was contacted and no secret was written during the change, and the production seed-token secret cleanup and the production admin credential reset are owner actions that have not been run.
