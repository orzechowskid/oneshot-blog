# Design: remove-seed-token-and-db-url-secrets

## Context

See proposal.md for the motivation. This section lists only the current state
and constraints that shape the approach.

Current state of the code:

- `scripts/deploy.ts` reads the local environment at module level and, on
  every run, stores `SEED_TOKEN` and, when a local `DATABASE_URL` exists, that
  local value as deployed secrets, and prints the seed token at the end.
  Measured lines: the seed token constant (lines 14 to 15, with the
  `randomBytes` import at line 1), the `SEED_TOKEN=${seedToken}` list entry
  (line 105), the `if (databaseUrl) secrets.push(`DATABASE_URL=${databaseUrl}`)`
  line (line 107), the `seedOwner()` function (line 130) that posts to
  `/internal/seed` with the `X-Seed-Token` header, its call in `main()`
  (line 177), and the token print (line 181).
- The seed path also spans: `app/routes/seed.tsx` (the route handler),
  `app/routes.ts` (the `route("internal/seed", "routes/seed.tsx")` line),
  `scripts/seed.ts` (the `npm run seed` script), `scripts/install.ts`
  (`generateToken()` at line 131, `const seedToken = generateToken()` at line
  262, the `SEED_TOKEN` entries at lines 274 and 321), `.env.example` (the
  `SEED_TOKEN` line at line 9), `playwright.config.ts` (the `SEED_TOKEN` web
  server entry at line 34), `tests/integration/blog.spec.ts` (the `SEED_TOKEN`
  constant at line 8 and the two seed-endpoint tests at lines 186 to 214), and
  `README.md` (the seed rows, the seed script row, the seed token row, the
  seed security bullet, and the deploy step that seeds the account).
- `scripts/deploy.ts` calls `main()` unconditionally at the end of the module,
  so a test that imports the module would run a deploy.

Fly CLI constraints, measured on 4 November 2026 and recorded in
decision-record.md:

- `fly postgres list` takes no app flag and its JSON output has no
  consumer-attachment field, so the CLI cannot report which apps are attached
  to a Postgres cluster.
- `fly postgres attach` refuses when the app already holds a `DATABASE_URL`
  secret, with the message `consumer app "oneshot-blog" already contains a
  secret named DATABASE_URL`.
- `fly secrets list --app <app> --json` returns the secret names of the
  deployed app, so secret presence is the practical signal for whether the app
  has a database address.

## Goals / Non-Goals

**Goals:**

- The deploy script stores exactly `ADMIN_EMAIL` and `ADMIN_PASSWORD` as
  deployed secrets. It never writes a `DATABASE_URL` secret and never writes a
  seed token.
- The deploy script decides the `fly postgres attach` step from the deployed
  app's own secret names, not from the local environment.
- The repository contains no seed token, no seed route, and no seeding step.
- `scripts/deploy.ts` is importable by unit tests without side effects.

**Non-Goals:**

- No password or token rotation. Nothing in this change rotates any password.
- No production admin credential reset. That is a separate later step.
- No change to local development. `npm run dev`, `npm start`, the database
  reset script, and the admin credential reset command keep reading the local
  `DATABASE_URL`.
- The production `SEED_TOKEN` secret cleanup is an operator action after the
  code lands, not part of the code.
- The admin credential pair and the `owner:reset` command stay as they are.

## Decisions

### D1. Deploy script structure: entry-point guard and exported decision functions

`scripts/deploy.ts` exports exactly two decision functions,
`buildDeploySecrets` and `shouldAttachPostgres`, and runs `main()` only when
the module is the entry point. The entry check compares `import.meta.url`
with `pathToFileURL(process.argv[1]).href`, the same pattern as
`scripts/owner-reset.ts`. Both functions take their inputs as parameters
(`buildDeploySecrets` takes the email and password; `shouldAttachPostgres`
takes the list of deployed secret names) so that unit tests call them without
a network, without `flyctl`, and without reading the test runner's
environment. The JSON-to-names step that parses the `fly secrets list` output
stays private inside `scripts/deploy.ts` and is not unit tested. Module-level
environment reads remain only where `main()` needs them.

The existing unit test `tests/unit/owner-reset.test.ts` already imports
`scripts/owner-reset.ts` in a node environment with no database, which proves
this pattern works in this repository.

Rejected alternatives:

- Spawn the script in a test with a fake `FLYCTL_BIN`. This runs the whole
  deploy flow, needs a stub for every `flyctl` call including `fly deploy .`,
  and tests the decision logic through a shell instead of directly.
- Assert on the source text of `scripts/deploy.ts` (for example, read the file
  and check that seed strings are absent). This breaks on any refactor and
  does not test behaviour. The absence of a seeding step is asserted by the
  behaviour of the exported functions instead.
- Export a third helper for the JSON-to-names step. The owner rejected it: the
  parse is three lines, and the rule it implements is proven by
  `shouldAttachPostgres` plus the refusal path in D3.

### D2. The secret list the deploy script writes is fixed to the admin pair

The secret list in the deploy step becomes exactly `ADMIN_EMAIL` and
`ADMIN_PASSWORD`. The two measured current lines are deleted, not guarded:

- line 105, the `SEED_TOKEN=${seedToken}` entry in the list, is deleted;
- line 107, `if (databaseUrl) secrets.push(`DATABASE_URL=${databaseUrl}`)`,
  is deleted.

With both lines deleted, the local `databaseUrl` read (line 18) and the
`randomBytes` import (line 1) have no remaining use and are deleted too.

Rejected alternative: keep the push behind a flag (for example, only push
`DATABASE_URL` when an environment variable is set). The owner's ban on
scripts setting `DATABASE_URL` for a deployed app is unconditional. A flag
leaves the local-to-deployed copy path in the code and lets one edited line in
`.env` re-arm the 4 November 2026 failure.

### D3. The attach decision reads the deployed app's secret names

The deploy script lists the deployed app's secret names with
`fly secrets list --app <app> --json`, extracts the name of each entry, and
runs the `fly postgres attach` step only when `DATABASE_URL` is absent from
that list. When `DATABASE_URL` is present, the deploy script changes nothing
about the database: no Postgres cluster creation, no attach. When it is
absent, the deploy keeps the existing Postgres cluster existence check and
creation, then runs the attach. The attach runs without the current
`allowFailure` flag, so a failed attach fails the deploy instead of being
swallowed.

The list read can fail. When the list command exits non-zero, its output does
not parse as JSON, or the parsed JSON is not an array, the deploy script
refuses: it prints a message naming the exact command the operator runs by
hand, `fly secrets list --app <app> --json`, writes no secret, runs no
attach, changes nothing about the database, and exits with status 1. An
empty list is a valid read, not a failure, and means the attach step runs.

This is possible because of the measured CLI behaviour in Context: `fly
postgres list` has no app flag and no consumer-attachment field, so secret
presence is the practical attachment signal, and `fly postgres attach` fails
with `consumer app "oneshot-blog" already contains a secret named
DATABASE_URL` when the app already holds the secret, so attach is a one-way
action that cannot re-point an app.

Consequence: if a deployed app holds a wrong `DATABASE_URL` secret that no
attachment backs, the deploy script does not repair it. The operator repairs
it by hand: unset the secret, then attach. This is the same procedure that
restored the production site on 4 November 2026.

Rejected alternatives:

- Keep the current unconditional attach with `allowFailure` (line 98). The
  deploy cannot then tell an already-attached app from an app that holds a
  wrong secret, and the failure output is swallowed while the wrong secret
  stays.
- Discover the attachment from the cluster side with `fly postgres list`.
  Measured: the command has no app flag and its JSON has no
  consumer-attachment field.
- Verify the database by connecting to it. The deploy script does not hold
  the deployed secret value, and a connection test needs that value plus
  network access to the database. A names list is one read-only call.

### D4. Local development keeps reading the local `DATABASE_URL`

`npm run dev`, `npm start`, the database reset script, and the admin
credential reset command keep reading `DATABASE_URL` from `.env` or the local
environment, unchanged. The ban in this change is on writing the deployed
app's secret, not on local use. The 4 November 2026 incident was a write of
the local value into the production secret store; local use was not the fault.

### D5. Removal list: every place the seed path touches

- `app/routes/seed.tsx`: deleted.
- `app/routes.ts`: the `route("internal/seed", "routes/seed.tsx")` line is
  removed.
- `app/lib/posts.server.ts`: `countUsers` (line 437) and `createOwner`
  (line 445) are deleted. Their only consumer is `app/routes/seed.tsx`,
  which this change deletes.
- `app/routes/admin-autosave.tsx`: the comment at line 13 points at
  `seed.tsx` and is repointed to `app/routes/image.tsx`.
- `scripts/seed.ts`: deleted.
- `package.json`: the `seed` script entry is removed.
- `scripts/install.ts`: the installer no longer generates a seed token. The
  `generateToken()` function (line 131), the `const seedToken =
  generateToken()` call (line 262), and both `SEED_TOKEN` entries (lines 274
  and 321) are removed. The installer stops writing `APP_URL`: both `APP_URL`
  writes (lines 275 and 322) are removed. The installer keeps writing the
  local development `DATABASE_URL`.
- `.env.example`: the `SEED_TOKEN` line (line 9) and the `APP_URL` line
  (line 10) are dropped.
- `scripts/deploy.ts`: the seeding step is removed. The seed token constant
  (lines 14 to 15), the `randomBytes` import (line 1), the `SEED_TOKEN` list
  entry (line 105), the `DATABASE_URL` push (line 107), the `seedOwner()`
  function (line 130), its call (line 177), and the token print (line 181)
  are removed. The local `DATABASE_URL` gate in the database step (lines 71
  to 75) is removed and replaced by the deployed-app check in D3.
- `tests/integration/blog.spec.ts`: the two seed-endpoint tests (lines 186 to
  214) and the `SEED_TOKEN` constant (line 8) are deleted. The rest of the
  suite keeps running.
- `playwright.config.ts`: the `SEED_TOKEN` web server entry (line 34) is
  dropped.
- `README.md`: the seed rows, the seed script row, the seed token row, the
  `APP_URL` row (line 104), and the seed security bullet go away, and the
  deploy description states the attach rule: the deploy stores the admin
  pair, and the only mechanism that sets the deployed app's database address
  is `fly postgres attach`.

### D6. Failure behaviour

The deploy script keeps its refusal when the admin pair is missing: when
`ADMIN_EMAIL` or `ADMIN_PASSWORD` is absent, it prints the same message and
exits with status 1. The seeding step disappears, so a deploy ends after the
health check. No deploy performs an HTTP request that carries a seed
credential.

### D7. Test plan

New unit test file `tests/unit/deploy.test.ts`, which imports the exported
decision functions from `scripts/deploy.ts` and asserts:

- the secret list builder, called with the fixture email
  `deploy-test@example.com`, returns exactly the `ADMIN_EMAIL` and
  `ADMIN_PASSWORD` entries, and never contains `DATABASE_URL` or
  `SEED_TOKEN`, even when a local `DATABASE_URL` is set in the test
  environment;
- the attach decision returns true only when the deployed secret names lack
  `DATABASE_URL`, and false when they contain it;
- no seeding step exists: the export list is exactly `buildDeploySecrets`
  and `shouldAttachPostgres`.

Commands:

- `npm run verify` (typecheck, unit tests, build)
- `npm run test:integration` (Playwright suite with the seed tests removed)
- `grep -rn "SEED_TOKEN" app/ scripts/ playwright.config.ts .env.example package.json README.md`
  must return no match
- `grep -rn "internal/seed" app/ scripts/ playwright.config.ts .env.example package.json README.md`
  must return no match

## Risks / Trade-offs

- [The production app still holds the `SEED_TOKEN` secret after the code
  lands] → Operator runbook, owner-approved: after the deploy, run
  `fly secrets unset -a oneshot-blog SEED_TOKEN`. Until then the secret is
  inert: the route it unlocked is deleted.
- [A deployed app can hold a wrong `DATABASE_URL` secret that no attachment
  backs, and the deploy script will not repair it] → Operator runbook:
  `fly secrets unset -a <app> DATABASE_URL`, then `fly postgres attach
  <db> --app <app> --database-name <name> --database-user <user> --yes`. The
  same procedure restored the production site on 4 November 2026.
- [The 4 November 2026 restore created a new database role
  `oneshot_blog_app` because the role `oneshot_blog` already existed, and the
  attach printed the new role password to the terminal] → Recorded as a
  follow-up item the owner owns: decide whether to keep both roles or rotate
  or drop one. Nothing in this change rotates a password.
- [`fly postgres attach` prints the new role password to the terminal on a
  fresh attach, measured on 4 November 2026] → Known Fly behaviour, unchanged
  by this design. The README states the attach rule so the operator expects
  the printed password and stores it.
- [The deploy makes one extra read-only `fly secrets list` call per run] →
  Cost is one API call. Benefit is the attach decision in D3.
- [The JSON shape of the `fly secrets list --app <app> --json` output is
  assumed by the private parse, and the parse shape is proven first by a real
  deploy, not by a unit test] → The consequence of that risk is a refusal,
  not a bad secret write: on a failed read the deploy script prints the list
  command, writes no secret, runs no attach, and changes nothing about the
  database; it exits with status 1.
- [Unit tests import `scripts/deploy.ts`] → The entry-point guard in D1
  guarantees no `flyctl` call, no fetch, and no exit at import time, the same
  guarantee `tests/unit/owner-reset.test.ts` already relies on.

## Migration Plan

1. Land the code: the route and its registration, the two seed files, the
   npm script, the installer change, the `.env.example` line, the deploy
   script change, the test changes, and the README update.
2. Run `npm run verify` and `npm run test:integration` before deploying.
3. Deploy with `ADMIN_EMAIL` and `ADMIN_PASSWORD` set. Production already
   holds a `DATABASE_URL` secret from the attach of 4 November 2026, so this
   deploy writes only the admin pair and runs no attach step.
4. Operator cleanup, owner-approved: `fly secrets unset -a oneshot-blog
   SEED_TOKEN`.
5. Rollback: revert the code change. The production `SEED_TOKEN` is harmless
   either before or after step 4. If the rollback restores the route while the
   secret still exists, the route refuses to act: measured on the live app,
   it returns 409 with the correct token once one user row exists and 403
   with a wrong token. No database action is needed for a rollback.

## Open Questions

None. Every decision needed for the next step is owner-confirmed in
decision-record.md.
