## Purpose

Defines how a merge into `develop` or `main` deploys that environment through the continuous integration pipeline: which app is targeted, which tests gate the deploy, which token and credential pair each pipeline uses, and how the per-environment Fly configuration files are managed.

## Requirements

### Requirement: Two named environments with their own addresses
The deployed system SHALL consist of exactly two named environments. The production environment SHALL run on the Fly app `danorz-com-blog-prod` and be reachable at the public address `https://danorz-com-blog-prod.fly.dev/`. The pre-production environment SHALL run on the Fly app `danorz-com-blog-stage` and be reachable at the public address `https://danorz-com-blog-stage.fly.dev/`. Each environment SHALL own its own Fly Postgres app: `danorz-com-blog-prod-db` for production and `danorz-com-blog-stage-db` for pre-production. A sign-in proof posts the `email` and `password` fields of the `/login` form with that environment's own credential file: success is HTTP 302 with Location `/admin`; HTTP 400 is a field error and HTTP 401 is bad credentials. Cross-site request protection is header-based, so a plain form post passes. The proof command carries no `-v`, no `-D -`, no `set -x`, and no `-f`, so the password value never appears in the output.

#### Scenario: Both environments answer at their own addresses
- **WHEN** `curl -s -o /dev/null -w '%{http_code}' https://danorz-com-blog-prod.fly.dev/health` is run
- **THEN** it prints `200`
- **AND** `curl -s -o /dev/null -w '%{http_code}' https://danorz-com-blog-stage.fly.dev/health` prints `200`

#### Scenario: Both database clusters are listed
- **WHEN** `flyctl postgres list` is run
- **THEN** the output lists `danorz-com-blog-prod-db` and `danorz-com-blog-stage-db`

#### Scenario: Production sign-in uses the production credential file
- **WHEN** `set -a; . ./admin-creds.dotenv; set +a` is run, followed by `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' --data-urlencode "email=$ADMIN_EMAIL" --data-urlencode "password=$ADMIN_PASSWORD" https://danorz-com-blog-prod.fly.dev/login`
- **THEN** the command prints `302 /admin`

#### Scenario: Pre-production sign-in uses the pre-production credential file
- **WHEN** `set -a; . ./admin-creds-stage.dotenv; set +a` is run, followed by `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' --data-urlencode "email=$ADMIN_EMAIL" --data-urlencode "password=$ADMIN_PASSWORD" https://danorz-com-blog-stage.fly.dev/login`
- **THEN** the command prints `302 /admin`

### Requirement: Merges deploy the matching environment only
A merge into `develop` SHALL start the pre-production pipeline and deploy `danorz-com-blog-stage`. A merge into `main` SHALL start the production pipeline and deploy `danorz-com-blog-prod`. A merge into `develop` SHALL NOT start the production pipeline and SHALL NOT add a release to `danorz-com-blog-prod`.

#### Scenario: Merge to develop deploys pre-production
- **WHEN** the release count for `danorz-com-blog-stage` is measured with `flyctl releases --app danorz-com-blog-stage -j --jq 'length'`, then a commit is merged into `develop`, then the same command is run again after the pre-production pipeline run for that commit completes
- **THEN** the second count is one greater than the first
- **AND** `gh run list --workflow deploy-prod.yml` shows no production pipeline run for that commit

#### Scenario: Merge to main deploys production
- **WHEN** the release count for `danorz-com-blog-prod` is measured with `flyctl releases --app danorz-com-blog-prod -j --jq 'length'`, then a commit is merged into `main`, then the same command is run again after the production pipeline run for that commit completes
- **THEN** the second count is one greater than the first
- **AND** `gh run list --workflow deploy-stage.yml` shows no pre-production pipeline run for that commit

#### Scenario: Merge to develop does not touch production
- **WHEN** the release count for `danorz-com-blog-prod` is measured with `flyctl releases --app danorz-com-blog-prod -j --jq 'length'`, then a commit is merged into `develop` and the pre-production deploy completes, then the same command is run again
- **THEN** the second count equals the first

### Requirement: Typecheck and unit suite gate every deploy
Each pipeline SHALL run the typecheck (`npm run typecheck`) and the unit test suite (`npm test`) before any deploy step. When either fails, the pipeline SHALL stop and no deploy step SHALL run for that environment.

#### Scenario: A failing typecheck blocks the pre-production deploy
- **WHEN** a change that fails `npm run typecheck` is merged into `develop` and the release count for `danorz-com-blog-stage` is measured with `flyctl releases --app danorz-com-blog-stage -j --jq 'length'` before and after the pipeline run
- **THEN** the pre-production pipeline run fails at the typecheck step, as shown by `gh run view <run-id>`
- **AND** no deploy step runs and the two counts are equal

#### Scenario: A failing unit test blocks the production deploy
- **WHEN** a change that fails `npm test` is merged into `main` and the release count for `danorz-com-blog-prod` is measured with `flyctl releases --app danorz-com-blog-prod -j --jq 'length'` before and after the pipeline run
- **THEN** the production pipeline run fails at the unit suite step, as shown by `gh run view <run-id>`
- **AND** no deploy step runs and the two counts are equal

#### Scenario: Passing gates proceed to the deploy
- **WHEN** a change that passes `npm run typecheck` and `npm test` is merged into `develop` and the release count for `danorz-com-blog-stage` is measured with `flyctl releases --app danorz-com-blog-stage -j --jq 'length'` before and after the pipeline run completes
- **THEN** the second count is one greater than the first

### Requirement: Browser suite gates pre-production only
The pre-production pipeline SHALL run the browser test suite against a database service provided by the pipeline itself, before its deploy step. The browser suite SHALL sign in with the fixed test account from `tests/integration/test-account.ts`; the pipeline step SHALL set only `DATABASE_URL`, and SHALL NOT set `ADMIN_EMAIL` or `ADMIN_PASSWORD` from a live credential pair. The browser suite SHALL NOT run against the deployed pre-production database. The production pipeline SHALL NOT run the browser suite.

#### Scenario: The browser suite step uses the pipeline database and the fixed test account
- **WHEN** `grep -n -A 3 'npm run test:integration' .github/workflows/deploy-stage.yml` is run
- **THEN** the step's `env:` block sets only `DATABASE_URL=postgres://blog:blog@localhost:5432/blog`
- **AND** `grep -n 'image: postgres:16' .github/workflows/deploy-stage.yml` shows the pipeline's Postgres service
- **AND** the step sets no `ADMIN_EMAIL` and no `ADMIN_PASSWORD`, so the suite signs in with the fixed test account from `tests/integration/test-account.ts`, not with a live credential pair

#### Scenario: A failing browser test blocks the pre-production deploy
- **WHEN** a change that fails one browser test is merged into `develop` with the typecheck and the unit suite passing, and the release count for `danorz-com-blog-stage` is measured with `flyctl releases --app danorz-com-blog-stage -j --jq 'length'` before and after the pipeline run
- **THEN** the pre-production pipeline run fails at the browser suite step, as shown by `gh run view <run-id>`
- **AND** no deploy step runs and the two counts are equal

#### Scenario: Production pipeline runs no browser suite
- **WHEN** `grep -nE 'test:integration|services:' .github/workflows/deploy-prod.yml` is run
- **THEN** no match appears

### Requirement: Production deploys only through a merged pull request
A production deploy SHALL start only when a pull request into `main` is merged. A direct push to `main` SHALL NOT start the production pipeline.

#### Scenario: A merged pull request starts the production pipeline
- **WHEN** a pull request into `main` is merged and `gh run list --workflow deploy-prod.yml` is run
- **THEN** the output shows a production pipeline run whose commit is the merge commit

#### Scenario: A direct push starts no production pipeline
- **WHEN** a commit is pushed directly to `main` and `gh run list --workflow deploy-prod.yml` is run
- **THEN** the output shows no production pipeline run whose commit is that commit

### Requirement: Each pipeline uses its own token and credential pair
The production pipeline SHALL authenticate with the app-scoped Fly API token stored in the repository secret `FLY_API_TOKEN_PROD` and SHALL read the admin credential pair only from `ADMIN_EMAIL_PROD` and `ADMIN_PASSWORD_PROD`. The pre-production pipeline SHALL authenticate with the app-scoped token in `FLY_API_TOKEN_STAGE` and SHALL read the admin credential pair only from `ADMIN_EMAIL_STAGE` and `ADMIN_PASSWORD_STAGE`. The single shared `FLY_API_TOKEN` secret SHALL be removed. No pipeline SHALL reference the other environment's token or credential secrets. The deploy output SHALL name the environment's app and the admin address it stores, and SHALL contain no password value.

#### Scenario: Two app-scoped tokens replace the shared token
- **WHEN** `gh secret list` is run
- **THEN** the output contains a line named exactly `FLY_API_TOKEN_PROD` and a line named exactly `FLY_API_TOKEN_STAGE`
- **AND** the output contains no line named exactly `FLY_API_TOKEN`

#### Scenario: No pipeline references the other environment's secrets
- **WHEN** `grep -nE 'FLY_API_TOKEN_STAGE|ADMIN_EMAIL_STAGE|ADMIN_PASSWORD_STAGE' .github/workflows/deploy-prod.yml` is run
- **THEN** no match appears
- **AND** `grep -nE 'FLY_API_TOKEN_PROD|ADMIN_EMAIL_PROD|ADMIN_PASSWORD_PROD' .github/workflows/deploy-stage.yml` shows no match

#### Scenario: Deploy output names the app and the address, never the password
- **WHEN** the log of a completed production run is read with `gh run view <run-id> --log`
- **THEN** the log contains `danorz-com-blog-prod` and the admin address from `admin-creds.dotenv`
- **AND** after `set -a; . ./admin-creds.dotenv; set +a`, the command `gh run view <run-id> --log | grep -F "$ADMIN_PASSWORD"` finds no match
- **AND** the same two checks, with the stage run, `admin-creds-stage.dotenv`, and `danorz-com-blog-stage`, give the same result

### Requirement: Two Fly configuration files and no default
The repository SHALL contain exactly two Fly configuration files, one per named environment, and SHALL NOT contain a default Fly configuration file named `fly.toml`. Every deploy SHALL name the environment it targets explicitly and SHALL use that environment's Fly configuration file. The deploy engine SHALL refuse to run when no environment name is given.

#### Scenario: Exactly two Fly configuration files exist
- **WHEN** `git ls-files '*.toml'` is run
- **THEN** the output lists exactly two Fly configuration files, `fly.prod.toml` and `fly.stage.toml`
- **AND** no listed file is named `fly.toml`

#### Scenario: Deploy without a named environment is refused
- **WHEN** `node scripts/deploy.ts` is run with no environment name
- **THEN** it exits with status 1, performs no deploy, and prints the two environment names it accepts, `prod` and `stage`

#### Scenario: Every deploy names its environment
- **WHEN** `grep -n 'node scripts/deploy.ts prod --config fly.prod.toml' .github/workflows/deploy-prod.yml` is run
- **THEN** a match appears
- **AND** `grep -n 'node scripts/deploy.ts stage --config fly.stage.toml' .github/workflows/deploy-stage.yml` shows a match

### Requirement: No npm command performs a remote deploy
No npm command SHALL perform a remote deploy. The `deploy` npm script SHALL be removed from `package.json`. The local commands SHALL keep working: the setup script, the dev server, the production-style start, the build, the typecheck, the unit suite, the browser tests, the local database up and down, the local database reset script, and the admin credential reset command.

#### Scenario: No deploy script in package.json
- **WHEN** `grep -n '"deploy"' package.json` is run
- **THEN** no match appears
- **AND** no script value in `npm pkg get scripts` invokes the deploy engine or a Fly deploy

#### Scenario: Local commands keep working
- **WHEN** `npm run db:up`, `npm run build`, `npm run typecheck`, `npm test`, and `npm run owner:reset` are run on a development machine with the local database
- **THEN** each command exits with status 0
- **AND** `npm run dev` and `npm start` start their servers on local addresses
- **AND** the release count for `danorz-com-blog-prod` and the release count for `danorz-com-blog-stage`, each measured with `flyctl releases --app <app> -j --jq 'length'`, are unchanged by the commands
