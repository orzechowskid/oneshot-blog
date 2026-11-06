# Wave 2 runtime verification — admin-credentials-env-and-reset

Run by the worker (the wave 1 reviewer had no shell). All commands ran from
`/home/dan/repos/oneshot-blog` against the local Docker database only.
No repository files were edited except this report. No git state was changed.

## Step 1 — `npm run db:up`
Exit: 0
```
Container oneshot-blog-db-1 Running
Container oneshot-blog-db-1 Waiting
Container oneshot-blog-db-1 Healthy
```

## Step 2 — `npm run verify` (typecheck && test && build)
Exit: 0. Unit test summary (re-run of `npm run test` to capture the count):
```
Test Files  11 passed (11)
     Tests  111 passed (111)
```
Production build completed (client + SSR).

## Step 3 — `npx playwright test --list`
Exit: 0
```
Total: 52 tests in 5 files
```

## Step 4 — `npm run test:integration` (playwright test)
Exit: 0
```
52 passed (1.7m)
```
Pass: 52. Fail: 0.

## Step 5 — env-name grep checks (expect no match)
```
$ grep -rn 'BOOTSTRAP_\|OWNER_' app scripts tests playwright.config.ts .env.example README.md
(no output) exit 1
$ grep -rn 'owner@example.com' app scripts playwright.config.ts .env.example README.md
(no output) exit 1
```
No match from either grep.

## Step 6 — deploy guard: `env -u ADMIN_EMAIL -u ADMIN_PASSWORD node scripts/deploy.ts`
Exit: 1
```
Set ADMIN_EMAIL and ADMIN_PASSWORD in the environment or .env, then run the deploy again.
```
Refusal names both variables. No flyctl call made.

## Step 7 — seed guard: `env -u ADMIN_PASSWORD SEED_TOKEN=t ADMIN_EMAIL=a@b.co node scripts/seed.ts`
Exit: 1
```
Error: ADMIN_PASSWORD is required.
    at file:///home/dan/repos/oneshot-blog/scripts/seed.ts:13:9
```
Thrown at scripts/seed.ts:13, before any network code. No network request.

## Step 8 — owner-reset guard: `env -u DATABASE_URL -u ADMIN_EMAIL -u ADMIN_PASSWORD node scripts/owner-reset.ts`
Exit: 1
```
DATABASE_URL is not set.
```
Hard error naming the missing variable.

## Step 9 — multi-row refusal, end to end
Commands, in order:
```
$ node --env-file-if-exists=.env scripts/reset-db.ts            -> "Database reset." exit 0
$ env ADMIN_EMAIL=multi-one@example.com ADMIN_PASSWORD=multi-password-one-12 npm run owner:reset
    -> printed "multi-one@example.com", exit 0
$ docker compose exec -T db psql -U blog -d blog -c \
    "insert into users (email, password_hash) values ('multi-two@example.com', 'scrypt$16384$8$1$x$y')"
    -> INSERT 0 1
$ env ADMIN_EMAIL=multi-three@example.com ADMIN_PASSWORD=multi-password-three-12 npm run owner:reset
    -> exit 1 (see refusal message below)
```
Refusal message:
```
Refusing to reset: the users table has 2 rows. Expected at most 1 row. Nothing was changed.
```
Row count in message: 2.

Before (2 rows) / after (same 2 rows), `email`, `left(password_hash,20)`, count:
```
        email        |  hash_prefix   | count
---------------------+----------------+------
multi-one@example.com| scrypt$16384$8$1$CVg | 2
multi-two@example.com| scrypt$16384$8$1$x$y | 2
```
Identical before and after: emails, hash prefixes, and count (2) unchanged.

## Step 10 — cleanup
```
$ node --env-file-if-exists=.env scripts/reset-db.ts
    -> "Database reset." exit 0
$ env ADMIN_EMAIL=owner@example.com ADMIN_PASSWORD=test-owner-password npm run owner:reset
    -> printed "owner@example.com", exit 0
```
Local dev database ends with the usual test account.

## Step 11 — read-only checks
```
$ grep -n 'COPY --from=build /app/scripts' Dockerfile
22:COPY --from=build /app/scripts/owner-reset.ts ./scripts/
$ node -e "console.log(require('./package.json').scripts['owner:reset'])"
node --env-file-if-exists=.env scripts/owner-reset.ts
$ grep -c '^ADMIN_EMAIL=\|^ADMIN_PASSWORD=' .env.example
2
$ grep -c 'admin password' app/lib/validation.ts
1
$ git log --oneline -3
efc3d23 Add owner:reset command for the admin credential pair
c543e89 Rename admin credential env vars to ADMIN_EMAIL/ADMIN_PASSWORD
e23fd45 Merge pull request #1 from orzechowskid/markdown-draft-editor
```

## Note on concurrent modification
During this run, `README.md` was modified by a process other than this worker
(its mtime is inside the run window; no command in this run writes it, and the
diff content matches this change: the owner:reset production form and the
DATABASE_SSL table row). The worker left it untouched and did not restore it.

## Result
All 11 steps passed with the expected behaviour. No failures.
