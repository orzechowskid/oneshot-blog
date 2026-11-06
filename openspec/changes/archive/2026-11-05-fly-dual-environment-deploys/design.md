# Design: fly-dual-environment-deploys

## Context

See proposal.md for the motivation. The current state, measured in this
environment, is:

- One Fly app `oneshot-blog` (suspended) and one Fly Postgres app
  `oneshot-blog-db`.
- Deploys run from a laptop through `npm run deploy`, which runs
  `scripts/deploy.ts`. The script reads the app name, region, and Postgres
  app name from environment variables (`FLY_APP`, `FLY_REGION`,
  `FLY_POSTGRES_APP`) or from `.env`.
- One Fly configuration file, `fly.toml`: app `oneshot-blog`, region `iad`,
  Dockerfile build, port `8080`, one shared vCPU and 512 MiB VM.
- One workflow, `.github/workflows/deploy.yml`: trigger
  `pull_request_target` closed against `main`, deploy only when the pull
  request was merged, run `flyctl deploy --remote-only --yes` with the
  repository secret `FLY_API_TOKEN`. It runs no test step.
- `scripts/deploy.ts` exports two decision functions
  (`shouldAttachPostgres`, `buildDeploySecrets`) covered by the unit suite.
  It refuses with a hand-run instruction when it cannot read the app list or
  the deployed secret list. It never writes a `DATABASE_URL` secret. The
  `fly postgres attach` step is the only mechanism that sets the deployed
  database address. Its attach call passes `--yes` to the attach command.
- The deploy tool is flyctl 0.5.4. Its `deploy` command has a configuration
  file flag (`-c, --config`), and its `tokens create deploy` command has an
  app scope flag (`-a`), an expiry flag (`-x`), and a JSON output flag
  (`-j`). Its `status` command takes `-a, --app` and `-j, --json`. Its
  `postgres attach` command takes `-a/--app`, `-c/--config`,
  `--database-name`, `--database-user`, `--superuser`, and
  `--variable-name`. It has no `postgres destroy` command and no
  `postgres snapshot` command: a Postgres app is an app, so
  `fly apps destroy <app> --yes` destroys it, and volume snapshots are taken
  with `fly volume snapshots create <volume-id> --app <db-app>`. Its
  `tokens list` command takes `-s, --scope` (`app` or `org`) and
  `-a, --app`, and its `tokens revoke` command takes one or more token ids.
  (Verified from local help output; no API call was made.)
- The Dockerfile build stage runs `COPY . .`, and `.dockerignore` excludes
  `node_modules`, `build`, `.git`, `tests`, `playwright-report`,
  `test-results`, `.env`, `.env.*`, and the other local artifacts, not the
  credential files. Every remote build uploads `admin-creds.dotenv` and
  `admin-creds-stage.dotenv` into the image registry.
- The two credential files are untracked and not listed in `.gitignore`. A
  broad `git add -A` would commit both admin passwords.
- Two deploy tokens scoped to the old app `oneshot-blog` exist.
- The repository has one author, and GitHub does not let an author approve
  their own pull request. A required approving review of one would block
  every merge to `main` permanently.
- `gh` 2.103.3 is installed and authenticated. The only repository secret
  today is `FLY_API_TOKEN`.
- The Playwright configuration (`playwright.config.ts`) reads `DATABASE_URL`
  (default `postgres://blog:blog@127.0.0.1:5432/blog`) and
  `ADMIN_EMAIL` / `ADMIN_PASSWORD` (default: a fixed test account). Its
  web server step builds the app, resets the database, and starts the server.
- The local Postgres service is `postgres:16` with user, password, and
  database all named `blog` (`docker-compose.yml`).

The decision record (`decision-record.md`) is the contract: owner decisions
1-14 bind this design, and the agent assumptions carry the remaining
choices.

## Goals / Non-Goals

**Goals:**

- Two named environments (`prod`, `stage`), each with its own Fly app, its
  own Postgres app, its own public address, its own admin credential pair,
  and its own app-scoped token.
- Deployment only through the continuous integration pipeline, with the
  environment named explicitly. The engine refuses to run without a valid
  environment name.
- One Fly configuration file per environment, no default file.
- A cutover from the old app; every step of the runbook states its rollback,
  and the irreversible steps are marked.

**Non-Goals:**

- No password change inside the app and no new seeding path.
- No custom domain work. Nothing is restored from the old database snapshot.
- The deferred cleanups stay deferred: the credential files,
  `.env.backup-*`, the extra database role, the machine sign-in credentials.
- Local development and local verification commands are unchanged.
- The `markdown-draft-editor` branch and change folder are untouched.

## Decisions

### D-1: Two named Fly configuration files, no default

`fly.toml` is replaced by `fly.prod.toml` and `fly.stage.toml`, and
`fly.toml` is deleted (owner decision 9). Both files have the same shape as
the current `fly.toml` (Dockerfile build, `PORT = "8080"`,
`NODE_ENV = "production"`, the same `http_service` block, the same `[[vm]]`
block). Two values differ:

| File | `app` | `primary_region` |
| --- | --- | --- |
| `fly.prod.toml` | `danorz-com-blog-prod` | `iad` |
| `fly.stage.toml` | `danorz-com-blog-stage` | `iad` |

How the deploy tool is told which file to use: the deploy engine passes the
file to flyctl with its configuration flag:

```bash
flyctl deploy . --app <app> --config <file> --remote-only --yes
```

The engine selects the file from the environment name (D-2), and the
pipeline names the same file on its command line. The engine refuses when
the two do not agree (D-2, refusal 3). The only other flyctl commands the
engine runs (`status`, `apps create`, `postgres create`, `postgres
attach`, `secrets set`, `secrets list`) take the app and database names as
explicit arguments, so they do not need a configuration file.

### D-2: The deploy engine takes the environment name as a required argument

`scripts/deploy.ts` keeps its role (create or verify the app, attach or
verify the database, store the credential pair, deploy, wait for the health
address) but its inputs change:

- Required first positional argument: the environment name. The engine
  accepts exactly `prod` and `stage`.
- A `--config <file>` argument: the Fly configuration file. The pipeline
  passes the file that matches the environment it names (decision record,
  agent assumption 1).
- `FLY_API_TOKEN`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` are still read from
  the process environment. The pipeline sets them from repository secrets.
  The engine refuses before it calls flyctl when any of the three is
  missing, and it names the missing variables.
- `FLY_APP`, `FLY_REGION`, `FLY_POSTGRES_APP`, and `FLY_ORG` are no longer
  read. Every per-environment value comes from the mapping table below.
  `FLYCTL_BIN` stays (default `flyctl`).

Environment-to-name mapping table, kept in the engine as the single source
of truth:

| Environment | Fly app | Postgres app | Config file | Region | Volume size | Public address |
| --- | --- | --- | --- | --- | --- | --- |
| `prod` | `danorz-com-blog-prod` | `danorz-com-blog-prod-db` | `fly.prod.toml` | `iad` | 1 GiB | `https://danorz-com-blog-prod.fly.dev` |
| `stage` | `danorz-com-blog-stage` | `danorz-com-blog-stage-db` | `fly.stage.toml` | `iad` | 1 GiB | `https://danorz-com-blog-stage.fly.dev` |

How each value is chosen per environment: the environment argument selects
one table row. The app name feeds the status probe, `fly apps create`, the
`--app` argument of every other command, and the health-check URL
(`https://<app>.fly.dev/health`). The Postgres app name, region, and volume
size feed `fly postgres create --name <db> --region iad --vm-size
shared-cpu-1x --volume-size 1 --initial-cluster-size 1` and
`flyctl postgres attach <db> --app <app>`. The attach line carries no
confirmation flag.

The app status probe. The engine's first flyctl call used to be the account
app list (`fly apps list --json`), checked for the app name. The pipeline
tokens are app-scoped (owner decision 11), and an app-scoped token cannot be
assumed to list the whole account's apps, so the account list is the wrong
read. The engine now asks the deployed app for its own status:

```bash
flyctl status --app <app> --json
```

where `<app>` is the table row's app name. The command exists in flyctl
0.5.4 and takes `-a, --app` and `-j, --json` (verified from local help
output). Three outcomes:

- Exit 0 with parseable JSON: the app exists. Continue.
- The flyctl not-found error for the app: the app is missing. The engine
  creates it with `fly apps create <app> --yes`. The runbook creates both
  apps by hand, so this path is a fallback that should not fire in the
  normal flow.
- Any other exit status, or output that is not parseable JSON: the read is
  unreadable. The engine refuses: it prints a hand-run instruction naming
  `flyctl status --app <app> --json` with the real app name, exits with
  status 1, and writes nothing. No app is created, no database is attached,
  no secret is written, nothing is deployed.

The preserved rule is the refusal on an unreadable read, in the script's
existing style. The command used for the read is the probe, not the account
app list.

Refusal rules. All of them exit with status 1 before any flyctl call and
print a hand-run instruction in the script's existing style:

1. No environment argument: print the two accepted names, `prod` and
   `stage`.
2. Environment argument that is not `prod` or `stage`: print the two
   accepted names.
3. `--config` value that does not equal the table's file for that
   environment: print the expected file name.
4. Configuration file missing or unreadable: print the hand-run
   instruction.
5. `FLY_API_TOKEN`, `ADMIN_EMAIL`, or `ADMIN_PASSWORD` missing: name the
   missing variable. When the credential pair is incomplete, the output
   names both `ADMIN_EMAIL` and `ADMIN_PASSWORD` and lists which of the two
   are missing.

Kept unchanged:

- The exported decision functions `shouldAttachPostgres(secretNames)` and
  `buildDeploySecrets(email, password)`, and the unit tests that cover them.
- The refusal when the deployed secret list cannot be read (hand-run
  `fly secrets list --app <app> --json`).
- The refusal with a hand-run instruction when the attach step fails.
- The rule that the engine never writes a `DATABASE_URL` secret. The attach
  step is the only mechanism that sets the deployed database address, and it
  runs only when the deployed secret list has no `DATABASE_URL`. The
  runbook attaches the database by hand before the first deploy
  (Migration Plan step 1), so the engine's attach path is the fallback that
  should not fire in the normal flow.
- The printed line naming the app and the email whose credential pair is
  stored. The engine never prints the password or the token.

Staging and the post-deploy check. The engine stores the pair with
`flyctl secrets set --app <app> --stage`, then runs `flyctl deploy`. The
staged secrets land with the deploy. The post-deploy check is
`flyctl secrets list --app <app>`: it shows `ADMIN_EMAIL` and
`ADMIN_PASSWORD` alongside `DATABASE_URL`. The check confirms the pair
landed; the sign-in proof (Migration Plan steps 3 and 6) is the real gate.

Alternative considered: derive the configuration file from the environment
name inside the engine and have the pipeline pass only the environment name.
Rejected: the pipeline command line would not show which file is used, and a
wrong file in the table would deploy silently. Passing the file explicitly
and refusing on mismatch keeps the command line and the run log correct at
the cost of one string comparison.

### D-3: npm scripts: the deploy script is removed, the rest stays

The `deploy` script is removed from `package.json` (owner decision 10). No
npm command performs a remote deploy. The engine is run only by the two
pipelines. The cutover runbook (Migration Plan) uses `flyctl` commands
directly; it does not run the engine.

Scripts that remain, and what each is for:

| Script | Purpose |
| --- | --- |
| `dev` | Start the Vite development server and SSR handler |
| `setup` | Write `.env` interactively (local mode only, D-6) |
| `build` | Build the client and server bundles |
| `start` | Run the production server |
| `typecheck` | Run TypeScript without emitting files |
| `test` | Run the Vitest unit suite |
| `test:watch` | Run Vitest in watch mode |
| `db:up` / `db:down` | Start / stop the local Postgres service (down also removes its volume) |
| `test:integration` | Run the Playwright browser suite against the local server and local database |
| `storybook` / `build-storybook` / `test:storybook` / `test:storybook:update` | Storybook dev server, static build, visual and accessibility tests, snapshot regeneration |
| `owner:reset` | Reset the admin email and password in the database |
| `verify` | Run typecheck, unit suite, and build |

The local database reset script `scripts/reset-db.ts` is run directly
(`node scripts/reset-db.ts`) as it is today. It is not an npm script and it
is unchanged.

### D-4: Two workflow files, one per environment

`.github/workflows/deploy.yml` is replaced by two files that arrive in the
same merge:

- `.github/workflows/deploy-prod.yml` - production.
- `.github/workflows/deploy-stage.yml` - pre-production.

Shared shape (the stage file differs where marked):

```yaml
on:
  pull_request_target:
    types: [closed]
    branches: [main]          # [develop] in the stage file
permissions:
  contents: read
concurrency:
  group: deploy-prod          # deploy-stage in the stage file
  cancel-in-progress: false
jobs:
  deploy:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.merge_commit_sha }}
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      # Stage file only:
      #   - run: npx playwright install --with-deps chromium
      #   - run: npm run test:integration   (env: DATABASE_URL, see below)
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: node scripts/deploy.ts prod --config fly.prod.toml
        # Stage file: node scripts/deploy.ts stage --config fly.stage.toml
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN_PROD }}   # _STAGE in the stage file
          ADMIN_EMAIL: ${{ secrets.ADMIN_EMAIL_PROD }}       # _STAGE in the stage file
          ADMIN_PASSWORD: ${{ secrets.ADMIN_PASSWORD_PROD }} # _STAGE in the stage file
```

Trigger, and why the pull request target pattern is kept. The current
workflow triggers on `pull_request_target` closed against `main`, deploys
only when `merged` is true, and checks out `merge_commit_sha`. The new files
keep this pattern per branch (`main` for production, `develop` for
pre-production). Reasons to keep it:

1. `pull_request_target` gives pull requests from forks access to
   repository secrets, so a merge from an external contributor also deploys.
2. The job checks out the merged commit, not the untrusted pull request
   head, so fork code never runs in the deploy step.
3. The workflow definition that executes is the copy on the target branch,
   so the pipeline can only deploy code that is already merged there.

Consequence: a direct push to either branch does not deploy. A merge through
a closed pull request does. A merge into `develop` starts only the stage
file, and a merge into `main` starts only the prod file.

Test gate. Both pipelines run `npm run typecheck` and `npm test` before the
deploy step. When either fails, the pipeline stops and the deploy step does
not run. Node version is 24 (`engines` in `package.json` requires
`>=24.13.0`; decision record, agent assumption 9).

Browser suite, pre-production pipeline only. The stage file adds a
`services:` block with a PostgreSQL container that matches the local compose
service: image `postgres:16`, user, password, and database `blog`, port
5432, `pg_isready` health check. Between the unit suite and the deploy it
runs `npx playwright install --with-deps chromium`, then `npm run test:integration` with
`DATABASE_URL=postgres://blog:blog@localhost:5432/blog`. The Playwright
configuration then does what it does locally: build the app, reset the
database, start the server, run the 50 browser tests. The browser suite
never connects to `danorz-com-blog-stage-db`. The prod file has no browser
suite and no service container. The stage job timeout is set above the prod
job timeout to cover the browser suite (estimate; the suite has not been
timed on a hosted runner).

Secrets consumed. `deploy-prod.yml` references only `FLY_API_TOKEN_PROD`,
`ADMIN_EMAIL_PROD`, and `ADMIN_PASSWORD_PROD`. `deploy-stage.yml` references
only `FLY_API_TOKEN_STAGE`, `ADMIN_EMAIL_STAGE`, and `ADMIN_PASSWORD_STAGE`.
No file references the other environment's secrets. The `env:` block maps
the per-environment secret names onto the `FLY_API_TOKEN`, `ADMIN_EMAIL`,
and `ADMIN_PASSWORD` variables the engine reads.

The exact command each pipeline runs for its deploy:

- Production: `node scripts/deploy.ts prod --config fly.prod.toml`
- Pre-production: `node scripts/deploy.ts stage --config fly.stage.toml`

### D-5: Tokens and repository secrets

Full list of repository secrets after the cutover (six):

| Secret | Value | Consumed by |
| --- | --- | --- |
| `FLY_API_TOKEN_PROD` | App-scoped deploy token for `danorz-com-blog-prod` | `deploy-prod.yml` |
| `FLY_API_TOKEN_STAGE` | App-scoped deploy token for `danorz-com-blog-stage` | `deploy-stage.yml` |
| `ADMIN_EMAIL_PROD` | Admin address from `admin-creds.dotenv` | `deploy-prod.yml` |
| `ADMIN_PASSWORD_PROD` | Admin password from `admin-creds.dotenv` | `deploy-prod.yml` |
| `ADMIN_EMAIL_STAGE` | Admin address from `admin-creds-stage.dotenv` | `deploy-stage.yml` |
| `ADMIN_PASSWORD_STAGE` | Admin password from `admin-creds-stage.dotenv` | `deploy-stage.yml` |

The current `FLY_API_TOKEN` secret is removed after the production pipeline
has deployed successfully (Migration Plan, step 2).

Token creation, after each app exists (decision record, agent assumption 4):

```bash
flyctl tokens create deploy -a <app> -x 8760h -j
```

A token limited to that one app, valid one year (the same expiry the current
README documents). Delivery to the repository without printing: extract the
token value from the JSON output and pipe it into `gh secret set <name>`, so
the value never appears in a terminal, a log, or a file. The credential pair
secrets are set the same way: read each value from the matching credential
file and pipe it into `gh secret set`. Nothing in the repository prints a
credential value.

### D-6: The setup script keeps only the local mode

`scripts/install.ts` (the `setup` script) offers two modes today. Mode 2
(Fly.io) writes `FLY_*` variables the engine no longer reads (D-2), edits
`fly.toml`, which is deleted (D-1), and can run the removed `npm run deploy`.
Mode 2 is removed. Mode 1 (local) is unchanged: it generates the local
credential pair randomly, writes `.env`, and backs up the existing `.env`
first. This is an agent choice; it is reversible.

### D-7: Documentation updates

- README: the Installer section describes the local mode only. The Commands
  table drops the `deploy` row. The Environment variables table drops
  `FLY_APP`, `FLY_REGION`, `FLY_POSTGRES_APP`, and `FLY_ORG`; it keeps
  `FLY_API_TOKEN` and `FLYCTL_BIN` as engine inputs supplied by the
  pipeline. The Deployment section is rewritten for pipeline-only deploys:
  two environments, two configuration files, two tokens, and a pointer to
  the Migration Plan. The `owner:reset` production form names
  `danorz-com-blog-prod`.
- `.env.example`: the `FLY_*` block is dropped. No locally-run deploy
  remains.

### D-8: The credential files are excluded from the build context

The Dockerfile build stage runs `COPY . .`. `.dockerignore` today excludes
`node_modules`, `build`, `.git`, `tests`, `playwright-report`,
`test-results`, `.env`, `.env.*`, and the other local artifacts, but not the
credential files. Every remote build, which is every pipeline deploy (D-4),
uploads `admin-creds.dotenv` and `admin-creds-stage.dotenv` into the image
registry, where both admin passwords are stored.

The fix is to add both names to `.dockerignore`. The build context then
excludes both files, and the remote build no longer uploads them.

### D-9: The credential files are excluded from the repository

The two credential files are untracked and not listed in `.gitignore`. Any
broad `git add -A` commits both admin passwords to the repository.

The fix is to add both names to `.gitignore`. The files stay in place
(removing them is the deferred cleanup), but a broad add can no longer
commit them.

## Risks / Trade-offs

- [Public pre-production address] `https://danorz-com-blog-stage.fly.dev`
  is reachable by anyone. The public reading view is empty until posts are
  created in stage; the admin area requires the stage credential pair. The
  owner accepted this (owner decision 12). Mitigation: the stage pair
  differs from the production pair, so a stage exposure does not open
  production. Rotate the stage pair if stage is exposed: deploy with the new
  pair, run `owner:reset` in the stage machine, verify sign-in, retire the
  old pair.
- [Tokens in repository secrets] The two app-scoped tokens are stored in
  GitHub repository secrets. Anyone who can read repository secrets can
  manage the matching app. Mitigation: app scoping limits a leaked token to
  one app. Revoke with `flyctl tokens revoke` and set a new secret.
- [The pipeline stores the admin credential pair] The production password
  exists in a repository secret (`ADMIN_PASSWORD_PROD`) and is passed to the
  pipeline on every deploy. Anyone who can read repository secrets can sign
  in to production. This follows from the pipeline being the only deploy
  path, because the engine stores the pair as app secrets on every deploy.
  Mitigation: the rotation procedure above, with `admin-creds.dotenv` kept
  as the saved copy until rotation is proven.
- [Old app destruction is irreversible] `fly apps destroy` cannot be
  undone, and it is the only destroy command: flyctl 0.5.4 has no
  `fly postgres destroy`, and a Postgres app is an app, so the same command
  destroys it. The Migration Plan marks the destruction step irreversible.
  Mitigation: the Migration Plan takes a volume snapshot of
  `oneshot-blog-db` before destruction (insurance only, optional by the
  owner's decision, not a restore path) and requires both sign-in proofs
  first.
- [Released hostname] Destroying `oneshot-blog` releases the global
  hostname `oneshot-blog.fly.dev` to the public namespace. Old readers lose
  the address. The owner decided to destroy both current apps (owner
  decision 1); this consequence belongs to that decision.
- [Facts not measured in this environment]
  - Precedence when `flyctl deploy` receives both the `-a, --app` flag and
    an `app` key in the configuration file. Both flags exist (verified from
    help output); both carry the same name in this design; precedence was
    not exercised.
  - The JSON field name of `flyctl tokens create deploy -j`. The flag exists
    (verified from help output); the field name is confirmed on first use.
  - Browser suite duration on a hosted runner. The stage job timeout is an
    estimate.
  - Fly.io billing for the second app and the second 1 GiB volume. Not a
    design constraint; recorded as not measured.

## Migration Plan

Numbered runbook, in order. The operator runs the flyctl steps with an
account-level token. The pipelines run the deploys. Every step states its
rollback. The irreversible steps are marked.

1. **Create the production app.**
   - `fly apps create danorz-com-blog-prod`
   - `fly postgres create --name danorz-com-blog-prod-db --region iad --vm-size shared-cpu-1x --volume-size 1 --initial-cluster-size 1`
   - `fly postgres attach danorz-com-blog-prod-db --app danorz-com-blog-prod`
     Run attach by hand so the generated database role password is visible;
     record it. The attach line carries no confirmation flag (D-2). Because
     the runbook attaches by hand, the engine's attach path, a fallback
     (D-2), should not fire on the first deploy.
   - Create the app-scoped token and set `FLY_API_TOKEN_PROD`,
     `ADMIN_EMAIL_PROD`, and `ADMIN_PASSWORD_PROD` (pair from
     `admin-creds.dotenv`) without printing the values (D-5).
   - Rollback: `fly apps destroy danorz-com-blog-prod-db --yes`;
     `fly apps destroy danorz-com-blog-prod --yes`; remove the three secrets
     with `gh secret remove`; revoke the token. Nothing else is touched.
2. **Deploy the production app.**
   Open a pull request from the change branch into `main` and merge it. The
   production pipeline runs the typecheck, the unit suite, then
   `node scripts/deploy.ts prod --config fly.prod.toml`. The engine probes
   the app with `flyctl status --app danorz-com-blog-prod --json`, finds the
   app and the `DATABASE_URL` secret already present, stores the pair as
   staged secrets, deploys, and waits for
   `https://danorz-com-blog-prod.fly.dev/health`. The same merge replaces
   `deploy.yml` with the two new files. After a successful run, remove the
   now-unused `FLY_API_TOKEN` secret.
   - Rollback: the old app keeps serving throughout. Fix the commit and
     merge again, or destroy the new app and redo step 1. The new app holds
     no user data; its database is empty.
3. **Prove production sign-in.**
   Post-deploy check: `flyctl secrets list --app danorz-com-blog-prod`
   shows `ADMIN_EMAIL` and `ADMIN_PASSWORD` alongside `DATABASE_URL` (the
   staged pair landed with the deploy, D-2).
   Sign in at `https://danorz-com-blog-prod.fly.dev` with the
   `admin-creds.dotenv` pair. The sign-in proof is the real gate; the secret
   list is a check, not a proof.
   - Rollback: this step changes no state. Do not continue after a failure;
     fix and redeploy first.
4. **Create the pre-production app.**
   - The three flyctl commands from step 1 for `danorz-com-blog-stage` and
     `danorz-com-blog-stage-db`.
   - Create the app-scoped token and set `FLY_API_TOKEN_STAGE`,
     `ADMIN_EMAIL_STAGE`, and `ADMIN_PASSWORD_STAGE` (pair from
     `admin-creds-stage.dotenv`) without printing the values.
   - Create the `develop` branch from the head of `main` after the step 2
     cutover merge: `git branch develop main && git push origin develop`.
     Creating it from the head after the merge, not from the commit before
     the merge, keeps the two branch histories identical, so later
     pull requests from `develop` into `main` show only the new diff.
   - Rollback: `fly apps destroy danorz-com-blog-stage-db --yes`;
     `fly apps destroy danorz-com-blog-stage --yes`; remove the three stage
     secrets; revoke the token; delete the `develop` branch.
5. **Deploy the pre-production app.**
   Because step 4 created `develop` from the head of `main` after the
   cutover, `develop` and `main` hold identical histories, and a pull
   request from the change branch into `develop` would be up to date and
   could not merge. The first merge into `develop` is the documentation
   follow-up: open a pull request into `develop` with the `README.md` and
   `.env.example` changes from D-7 and merge it. The stage pipeline runs the
   typecheck, the unit suite, the browser suite against the pipeline's
   Postgres service container, then `node scripts/deploy.ts stage --config
   fly.stage.toml`.
   - Rollback: revert the commit; the revert merges through a pull request
     into `develop`, re-runs the stage pipeline, and re-deploys stage. The
     stage app holds no user data.
6. **Prove pre-production sign-in.**
   Post-deploy check: `flyctl secrets list --app danorz-com-blog-stage`
   shows `ADMIN_EMAIL` and `ADMIN_PASSWORD` alongside `DATABASE_URL`.
   Sign in at `https://danorz-com-blog-stage.fly.dev` with the stage pair.
   The sign-in proof is the real gate.
   - Rollback: same gate rule as step 3.
7. **Snapshot the old database (insurance, optional).**
   - `flyctl volume list --app oneshot-blog-db` to read the volume id.
   - `flyctl volume snapshots create <volume-id> --app oneshot-blog-db`.
   - `flyctl volume snapshots list <volume-id> --app oneshot-blog-db` as the
     proof.
   flyctl 0.5.4 has no `fly postgres snapshot`. A volume snapshot of a
   running database is a block copy, not a consistent dump. By the owner's
   decision the step is insurance, optional, and not a restore path
   (agent assumption 6).
   - Rollback: none needed. The step is additive.
8. **Destroy the old app and the old database app (irreversible).**
   Only after steps 3 and 6 passed: `fly apps destroy oneshot-blog-db
   --yes`, then `fly apps destroy oneshot-blog --yes`. flyctl 0.5.4 has no
   `fly postgres destroy`; a Postgres app is an app, so the same command
   destroys it.
   Consequence: destroying `oneshot-blog` releases the global hostname
   `oneshot-blog.fly.dev` to the public namespace. Old readers lose the
   address.
   - Rollback: none. The step is irreversible. The snapshot from step 7 is
     the only insurance, and by owner decision it is not a restore path.
9. **Retire the old app's deploy tokens.**
   - `flyctl tokens list --scope app -a oneshot-blog` lists the two deploy
     tokens scoped to the old app (measured: both exist).
   - `flyctl tokens revoke <id> <id>` with the two token ids.
   - Rollback: none. A revoked token cannot be restored. The app it is
     scoped to no longer exists, so no token is needed in its place.
10. **Set the repository default branch to `develop`.**
    Repository setting, or `gh repo edit orzechowskid/oneshot-blog
    --default-branch develop`.
    - Rollback: set the default branch back to `main`.
11. **Apply branch protection on `main`.**
    Pull request required, no direct push, no force push, required
    approving review count 0. The count is 0, not 1: the repository has one
    author, and GitHub does not let an author approve their own pull
    request, so a required review of one would make the production deploy
    permanently unreachable.
    The exact rule set, measured against gh 2.103.3: `required_status_checks`
    null, `enforce_admins` true, `required_pull_request_reviews` with
    `required_approving_review_count` 0, `dismiss_stale_reviews` true,
    `require_code_owner_reviews` false, `restrictions` null,
    `required_linear_history` false, `allow_force_pushes` false,
    `allow_deletions` false.
    - Rollback: remove the protection rule.
12. **Regenerate the local credential pair.**
    `npm run setup` (local mode) writes a new random pair to `.env` and
    backs up the old `.env` first. `npm run owner:reset` applies the pair to
    the local database's single admin row.
    - Rollback: restore `.env` from the `.env.backup-<timestamp>` file
      created by setup. The local database can be reset with
      `scripts/reset-db.ts`.
