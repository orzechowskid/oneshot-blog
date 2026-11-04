# Verification: remove-seed-token-and-db-url-secrets

Date: 2026-11-04 16:37 UTC

All commands run from the repository root `/home/dan/repos/oneshot-blog`.
Results are measured, not estimated.

## Step 1: npm run verify

Command: `npm run verify`

Result: exit 0.

- `tsc --noEmit` printed no errors.
- vitest summary: `Test Files  12 passed (12)`, `Tests  116 passed (116)`, 0 failed, in 798 ms. This includes `tests/unit/deploy.test.ts`, which in isolation reports `Test Files  1 passed (1)`, `Tests  5 passed (5)`.
- `react-router build` completed: client build "✓ built in 935ms" (1524 modules), server build "✓ built in 117ms"; no `/internal/seed` route chunk in the output asset list.

## Step 2: npx playwright test --list

Command: `npx playwright test --list`

Result: exit 0. Output ends with `Total: 50 tests in 5 files`. The listed files are `tests/integration/adminlist.spec.ts` (6), `autosave.spec.ts` (7), `blog.spec.ts` (10), `draft-editing.spec.ts` (17), `publish.spec.ts` (10). No seed-endpoint test is listed.

## Step 3: npm run db:up

Command: `npm run db:up`

Result: exit 0. Output:

```
Container oneshot-blog-db-1 Running
Container oneshot-blog-db-1 Waiting
Container oneshot-blog-db-1 Healthy
```

## Step 4: npm run test:integration

Command: `npm run test:integration`

Result: exit 0. Playwright summary line: `50 passed (1.7m)`; 0 failed. No seed-endpoint test appears in the output.

## Step 5: grep for SEED_TOKEN

Command: `grep -rn "SEED_TOKEN" app/ scripts/ playwright.config.ts .env.example package.json README.md`

Result: no output, exit 1 (no match).

## Step 6: grep for internal/seed

Command: `grep -rn "internal/seed" app/ scripts/ playwright.config.ts .env.example package.json README.md`

Result: no output, exit 1 (no match).

## Step 7: grep for APP_URL

Command: `grep -rn "APP_URL" app/ scripts/ playwright.config.ts .env.example package.json README.md`

Result: no output, exit 1 (no match).

## Step 8: import the deploy module without side effects

Command: `env -u ADMIN_EMAIL -u ADMIN_PASSWORD -u FLY_API_TOKEN -u DATABASE_URL node --input-type=module -e "const m = await import('file://' + process.cwd() + '/scripts/deploy.ts'); console.log('exports:', Object.keys(m).sort().join(', '))"`

Result: exit 0. Output: `exports: buildDeploySecrets, shouldAttachPostgres`. No flyctl output.

## Step 9: run the deploy script without credentials

Command: `env -u ADMIN_EMAIL -u ADMIN_PASSWORD -u FLY_API_TOKEN -u DATABASE_URL node scripts/deploy.ts`

Result: exit 1. Refusal text, exactly:

```
Set ADMIN_EMAIL and ADMIN_PASSWORD in the environment or .env, then run the deploy again.
```

No flyctl call and no other output.

## Step 10: exports and entry guard in scripts/deploy.ts

Commands: `grep -c "export function" scripts/deploy.ts` and `grep -n "process.argv\[1\] !== undefined" scripts/deploy.ts`

Results: count is `2` (the two decision functions, `shouldAttachPostgres` at line 67 and `buildDeploySecrets` at line 112), and the entry-guard check `process.argv[1] !== undefined` is present at line 198.

## Step 11: secret-name read, refusal path, and no DATABASE_URL secret write in scripts/deploy.ts

Command: `grep -n "fly secrets list" scripts/deploy.ts`

Result: one printed line, line 75 — inside `refuseSecretListRead()`, which names the command the operator runs by hand:

```
75:      `fly secrets list --app ${appName} --json. ` +
```

The deployed-app read itself is invoked through the `fly()` helper at line 83: `fly(["secrets", "list", "--app", appName, "--json"], true)`, and the refusal path fires on a non-zero exit, a JSON parse failure, or a non-array result.

Command: `grep -n "DATABASE_URL" scripts/deploy.ts`

Result: two printed lines, both name checks or messages, never a secret write:

```
68:  return !deployedSecretNames.includes("DATABASE_URL");
102:      `App ${appName} already has a DATABASE_URL secret. Leaving the database untouched.`,
```

The only secret write in the script is `fly(["secrets", "set", "--app", appName, "--stage", ...secrets])`, where `secrets` is exactly the output of `buildDeploySecrets`: the `ADMIN_EMAIL` and `ADMIN_PASSWORD` entries.

## Totals

- Unit tests: 12 files, 116 tests, 0 failed (including 5 in `tests/unit/deploy.test.ts`).
- Playwright: 50 listed tests in 5 files; 50 passed, 0 failed in 1.7 minutes.
- Greps (steps 5-7): no matches, exit 1 each.
- Deploy script: imports side-effect free, refuses with exit 1 when the admin pair is missing, and writes only the admin credential pair as secrets.

No deployed app was contacted and no secret was written during this verification run.
