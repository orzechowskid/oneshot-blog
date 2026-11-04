# Decision record: remove-seed-token-and-db-url-secrets

Owner-confirmed decisions. Date: 2026-11-04. Status: agreed by the owner in
plain words in the chat of 4 November 2026.

## Why this change exists

The production site returned 500 on `/` and `/login` on 4 November 2026, after
`npm run deploy`. Measured cause: `scripts/deploy.ts` contains
`if (databaseUrl) secrets.push(`DATABASE_URL=${databaseUrl}`)`, where
`databaseUrl` is the local development value read from `.env`
(`postgres://blog:blog@127.0.0.1:5432/blog`). That pushed the laptop's
development database address into the deployed app's secrets, so the app
tried to reach a database at its own loopback address. `/health` returned 200
because it does not touch the database. The production data was unharmed:
1 user row, 0 posts.

Service was restored with the supported Fly path: unset the wrong
`DATABASE_URL` secret, then
`fly postgres attach oneshot-blog-db --app oneshot-blog --database-name oneshot_blog --database-user oneshot-blog-app --yes`,
then `fly secrets deploy`. `/`, `/login` and `/health` return 200. The attach
created a new database role `oneshot_blog_app` because the role
`oneshot_blog` already existed, and it printed the new role password to the
terminal.

A second measured fact: the same deploy run pushed the local seed token into
production, and the deploy script prints the seed token at the end of every
deploy. Measured on production: `POST /internal/seed` with the correct token
returns 409 `{"error":"An owner account already exists."}`, with a wrong token
returns 403, and `select count(*) from users` stays 1. The seed token now
unlocks a route that refuses to change anything.

## Owner's words

> get rid of the seed token, and don't allow any scripts to set DATABASE_URL
> manually (`fly postgres attach` is the only correct mechanism for this)

Follow-up confirmations from the owner:

1. Change name `remove-seed-token-and-db-url-secrets` is accepted.
2. The ban applies to remote and production deploys. The local development
   database address may stay in `.env`.
3. After the code lands, unset the production seed token secret
   (`fly secrets unset -a oneshot-blog SEED_TOKEN`). Owner approved this
   cleanup.
4. Test scope as recommended: unit tests on the deploy script's decision
   logic, integration suite with the seed tests removed, README matching code.

## Decisions, as agreed

1. Remove the seeding path completely: the `POST /internal/seed` route and its
   registration, `npm run seed` and `scripts/seed.ts`, the deploy script's seed
   step, its seed token handling, its random token generation, and the line
   that prints the token.
2. The installer stops writing `SEED_TOKEN` into a generated `.env`. The
   installer keeps writing the local development `DATABASE_URL`.
3. `SEED_TOKEN` is removed from `.env.example`.
4. No script writes a `DATABASE_URL` secret for a deployed app. The only
   mechanism for that is `fly postgres attach`.
5. The deploy script decides about the database from the deployed app, not from
   the local environment: it lists the deployed app's secret names, and only
   when `DATABASE_URL` is absent there it runs `fly postgres attach`. When it
   is present, the deploy script changes nothing about the database.
6. A local database address may be used locally by `npm run dev`, `npm start`,
   the database reset script and the admin credential reset command.
7. Tests: unit tests on the deploy script's decision logic — the secret list
   never contains `DATABASE_URL`, the attach path is chosen only when the
   deployed app lacks that secret, and no seeding step exists. Integration
   suite loses the two seed-endpoint tests and keeps the rest.
8. README matches the code: the seed rows, the seed script row, the seed token
   row and the seed security bullet go away, and the deploy description states
   the attach rule.
9. Production cleanup after the code lands: unset the `SEED_TOKEN` secret on
   app `oneshot-blog`. Owner approved. This is an operator action, not part of
   the code work.
10. The admin credential pair `ADMIN_EMAIL` / `ADMIN_PASSWORD` and the
    `owner:reset` command stay as they are. The credential reset on production
    is a separate later step and is not part of this change.

## Measured facts the artifacts must not contradict

- `scripts/deploy.ts` currently stores `SEED_TOKEN` and, when a local
  `DATABASE_URL` exists, `DATABASE_URL`, as deployed secrets, and prints
  `SEED_TOKEN` at the end.
- The seed route reads `SEED_TOKEN`, returns 403 for a bad token, 400 for a bad
  body, 409 when any user row exists, and creates an account only when the
  user table is empty.
- `fly postgres list` takes no app flag and its JSON has no consumer-attachment
  field. `fly secrets list --app <app> --json` gives secret names, so secret
  presence is the practical attachment signal.
- `fly postgres attach` refuses when the app already has a `DATABASE_URL`
  secret, with: `consumer app "oneshot-blog" already contains a secret named
  DATABASE_URL`.
- Playwright config sets `SEED_TOKEN` for the integration server, and
  `tests/integration/blog.spec.ts` contains the two seed-endpoint tests.
- `app/routes.ts` registers `internal/seed`.
- Production now has secrets `SEED_TOKEN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
  `DATABASE_URL` (the last one set by the attach on 4 November 2026).
- The main spec `openspec/specs/admin-credentials/spec.md` contains the
  requirement "Seed route refuses when any user exists" and the requirement
  "Deployed machines can run the reset command", which says the deploy script
  shall not change `SEED_TOKEN` or `DATABASE_URL`.

## Second-round decisions (owner, 4 November 2026)

Answers to the review of the artifacts. The owner's decisions:

1. Refuse when the deployed app's secret names cannot be read. When the list
   command exits non-zero, its output cannot be parsed as JSON, or the parsed
   JSON is not an array, the deploy script refuses: it prints a message
   naming the exact command to run by hand, changes nothing, writes no
   secret, and exits 1. An empty list is a valid read, not a failure, and
   means the attach step runs.
2. No third exported test helper. The deploy script exports exactly
   `buildDeploySecrets` and `shouldAttachPostgres`. The JSON-to-names step
   stays private inside the deploy script and is not unit tested.
3. Delete the two now-unused functions `countUsers` and `createOwner` from
   `app/lib/posts.server.ts`. This change deletes their only consumer,
   `app/routes/seed.tsx`.
4. The installer stops writing `APP_URL`. Delete both installer writes,
   delete the `.env.example` line, and delete the README row. The local
   untracked `.env` file keeps its line and is inert; it is not a task.
5. At sync time the main spec Purpose line in
   `openspec/specs/admin-credentials/spec.md` is edited to drop the
   seed-route mention. That edit belongs to the sync step, not to the
   delta.

Measured facts the review added:

- The two seed-endpoint tests in `tests/integration/blog.spec.ts` span lines
  186-214 (the two tests plus the blank line). Lines 215-218 belong to the
  surviving test "the home page lists the published post".
- Importing the current `scripts/deploy.ts` on this machine runs a real
  deploy, because the admin pair, the deploy tool access token and the
  database address are all present in the shell environment. Proof commands
  must scrub them.
- The only `APP_URL` consumer is `scripts/seed.ts`, which this change
  deletes.
- `countUsers` and `createOwner` are used only by `app/routes/seed.tsx`.
