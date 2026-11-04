# Wave 1 verification — admin-credentials-env-and-reset (tasks 1.1, 2.1, 2.2, 2.3, 3.1, 3.2, 4.1–4.5)

Run: 2026-11-05, from /home/dan/repos/oneshot-blog. Read-only: no files edited, no git state changes, no flyctl.

## Command results

1. `npm run db:up` — exit 0.
   - `Container oneshot-blog-db-1 Healthy`
2. `npm run verify` — exit 0.
   - `Test Files  10 passed (10)` / `Tests  102 passed (102)` (unit)
   - typecheck clean; build ok (`build/server/index.js 96.26 kB`, `✓ built in 907ms`)
3. `npx playwright test --list` — exit 0.
   - `Total: 52 tests in 5 files` (matches measured baseline)
4. `npm run test:integration` — exit 0.
   - **52 passed, 0 failed** (1.7m). All 5 spec files green; admin login succeeded from
     the webServer env, confirming the test-account → env → bootstrap chain works.
5. `grep -rn 'BOOTSTRAP_\|OWNER_' app scripts playwright.config.ts .env.example README.md` — exit 0 (matches found).
   - No matches in `app/`, `scripts/`, `playwright.config.ts` (rename landed there).
   - Residual: `.env.example:6,7,12,13` (BOOTSTRAP_EMAIL, BOOTSTRAP_PASSWORD, OWNER_EMAIL, OWNER_PASSWORD)
   - Residual: `README.md:53,56,57,100,101,104,105,137,138,186`
6. `grep -rn 'owner@example.com' app scripts playwright.config.ts .env.example README.md` — exit 0 (matches found).
   - `app/lib/validation.test.ts:43,52,69,77` — test-fixture email literals
   - `.env.example:6,12` — old lines; `README.md:56,137` — old examples
   - No matches in `scripts/`, `playwright.config.ts`
7. `node --input-type=module -e "import('./tests/integration/test-account.ts').then(m=>console.log(m.ADMIN_EMAIL,m.ADMIN_PASSWORD))"` — exit 0.
   - Output: `owner@example.com test-owner-password` (as expected)
8. `env -u ADMIN_EMAIL -u ADMIN_PASSWORD node scripts/deploy.ts` — exit 1.
   - Output: `Set ADMIN_EMAIL and ADMIN_PASSWORD in the environment or .env, then run the deploy again.`
   - Refusal names both variables; no flyctl call; no password printed. As expected.
9. `env SEED_TOKEN=t ADMIN_EMAIL=a@b.co -u ADMIN_PASSWORD node scripts/seed.ts` — exit 127.
   - `env: '-u': No such file or directory` — the literal command is malformed: `env`
     options must precede assignments, so `-u` was taken as the command. Harness issue,
     not a code failure.
   - Corrected run: `env -u ADMIN_PASSWORD SEED_TOKEN=t ADMIN_EMAIL=a@b.co node scripts/seed.ts` — exit 1.
   - Output: `Error: ADMIN_PASSWORD is required.` thrown at `scripts/seed.ts:13` before any I/O. As expected.
10. Placeholder reset check — **SKIPPED** (owner-reset is not in this wave).
    - Note: `scripts/owner-reset.ts` already exists in the repo; the placeholder premise
      ("does not exist yet") is stale.

## Verdict

All in-wave assertions pass: 1.1 (verified via command 4 login + verify), 2.1 (cmd 8),
2.2 (cmd 9 corrected), 2.3 (cmd 5: zero matches in `scripts/`), 3.1 (cmd 7), 3.2 (cmd 5/6:
zero matches in `playwright.config.ts`), 4.1–4.5 (cmd 3 count + cmd 4 all-pass).

## Findings

- Medium: `.env.example` still carries the four old variable lines (lines 6–7, 12–13).
  In scope of task 6.1 (docs wave, not this wave) — expected to remain until then.
- Medium: `README.md` still documents BOOTSTRAP_*/OWNER_* throughout (10 lines above).
  In scope of tasks 6.2/6.3 — expected to remain until then.
- Low: `app/lib/validation.test.ts` uses `owner@example.com` as a fixture email (4 lines).
  The final check 7.3 greps `app/` for this literal and will fail on these lines until a
  later wave changes the fixtures or the check scope.
- Info: command 9 as written cannot run (env option ordering); use options before assignments.
- Info: `scripts/owner-reset.ts` exists although the wave-10 placeholder assumes it does not.
