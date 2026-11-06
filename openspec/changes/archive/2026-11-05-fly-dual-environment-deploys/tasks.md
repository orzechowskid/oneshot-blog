# Tasks: fly-dual-environment-deploys

Implementation checklist for this change. Read `proposal.md`,
`specs/admin-credentials/spec.md`, `specs/deployment-pipeline/spec.md`,
`design.md`, and `decision-record.md` before starting. `decision-record.md`
is the contract: owner decisions 1-14 bind, agent assumptions carry the rest.
This revision folds in the read-only review of the live tools (flyctl 0.5.4,
gh 2.103.3): `fly apps destroy <app> --yes` is the only destroy command,
`fly postgres attach` takes no `--yes` flag, the engine reads the deployed app
with `flyctl status --app <app> --json` instead of the account app list, and
the branch protection requires 0 approving reviews.

- Sections 1-7 are implementation tasks, in dependency order. Each task
  names exactly one file, the change, and one verification command with its
  expected output.
- A task marked **(parallel-safe)** touches exactly one file and no other
  task's file; any two parallel-safe tasks may run at the same time. Tasks
  without the mark must run after the task they name.
- Section 8 verifies the repository after all implementation tasks are done.
- The final section, **Operator runbook**, is headed by: an agent must not
  run any item in that section without the operator running it. No task in
  sections 1-8 contains a command that contacts a deployed app, creates or
  destroys an app, writes or removes a secret, mints a token, or runs a
  deploy. Every such step is in the Operator runbook.

## 1. Fly configuration files

- [x] 1.1 Create `fly.prod.toml` (parallel-safe with 1.2). Copy the current `fly.toml` and change only the `app` value to `"danorz-com-blog-prod"`. `primary_region` stays `"iad"`. Every other line is identical to the current `fly.toml` (Dockerfile build, `PORT = "8080"`, `NODE_ENV = "production"`, the `http_service` block, the `[[vm]]` block). Verify with: `grep -oE '^(app|primary_region) = "[^"]*"' fly.prod.toml`. Expected output, exit 0:
  ```
  app = "danorz-com-blog-prod"
  primary_region = "iad"
  ```
- [x] 1.2 Create `fly.stage.toml` (parallel-safe with 1.1). Same change as 1.1, with the `app` value `"danorz-com-blog-stage"`. Verify with: `grep -oE '^(app|primary_region) = "[^"]*"' fly.stage.toml`. Expected output, exit 0:
  ```
  app = "danorz-com-blog-stage"
  primary_region = "iad"
  ```
- [x] 1.3 Delete `fly.toml` (after 1.1 and 1.2, so the shape is already copied; not parallel-safe with 1.1 and 1.2). Remove the file. The repository then contains exactly two Fly configuration files and no default one. Verify with: `ls fly.toml`. Expected output, exit 2:
  ```
  ls: cannot access 'fly.toml': No such file or directory
  ```

## 2. Deploy engine

- [x] 2.1 Rewrite `scripts/deploy.ts` (parallel-safe; 2.2 runs after this) for the environment argument, the per-environment names, and the configuration file, per design D-2. Changes:
  - Add the exported pure decision function `resolveEnvironment(name)`. For `"prod"` it returns `{ app: "danorz-com-blog-prod", postgresApp: "danorz-com-blog-prod-db", configFile: "fly.prod.toml", region: "iad", volumeSize: 1 }`. For `"stage"` it returns `{ app: "danorz-com-blog-stage", postgresApp: "danorz-com-blog-stage-db", configFile: "fly.stage.toml", region: "iad", volumeSize: 1 }`. For any other name it returns `undefined`. This table is the single source of truth for the per-environment values.
  - `main()` takes the environment name as the required first positional argument (accepts exactly `prod` and `stage`) and a required `--config <file>` argument.
  - The app status probe replaces the account-wide app list. The engine's first flyctl call is `flyctl status --app <app> --json`, where `<app>` is the row's app name; the same probe is used with the row's `postgresApp` when deciding whether the Postgres app exists. The pipeline tokens are app-scoped and cannot be assumed to list the whole account's apps, so the account list is not a valid read. Outcomes, in order: (a) exit 0 with parseable JSON: the app exists, continue; (b) a non-zero exit whose combined stderr and stdout contain "not found" (case-insensitive): the app is missing, create it with `fly apps create <app> --yes` for the web app, or `fly postgres create --name <db> --region <region> --vm-size shared-cpu-1x --volume-size 1 --initial-cluster-size 1` for the Postgres app; (c) any other exit status, or exit 0 with output that is not parseable JSON: the read is unreadable, and the engine refuses in the script's existing hand-run instruction style: it prints the probe command with the real app name (for example `flyctl status --app danorz-com-blog-prod --json`), exits with status 1, and writes nothing — no app is created, no database is attached, no secret is written, nothing is deployed. The runbook creates both apps by hand before the first deploy (Operator runbook 9.1 and 9.4), so the create paths are the fallback that should not fire in the normal flow.
  - Refusal rules, each exiting with status 1 before any flyctl call, in the script's existing hand-run instruction style: (1) no environment argument: print the two accepted names, `prod` and `stage`; (2) environment argument that is not `prod` or `stage`: print the two accepted names; (3) `--config` missing or not equal to the row's `configFile`: print the expected file name; (4) configuration file missing or unreadable: print the hand-run instruction; (5) `FLY_API_TOKEN`, `ADMIN_EMAIL`, or `ADMIN_PASSWORD` missing from the process environment: name the missing variable, and when the credential pair is incomplete the output names both `ADMIN_EMAIL` and `ADMIN_PASSWORD` and lists which of the two are missing (the one name when one is absent, both names when both are absent).
  - The `postgres attach` call is `fly postgres attach <db> --app <app>` with no `--yes` element: flyctl 0.5.4's `postgres attach` has no `--yes` flag. The hand-run instruction printed on attach failure already names the command without the flag.
  - The deploy command is `flyctl deploy . --app <app> --config <file> --remote-only --yes`. `--remote-only` is the default in flyctl 0.5.4; keeping it is harmless.
  - Stop reading `FLY_APP`, `FLY_REGION`, `FLY_POSTGRES_APP`, and `FLY_ORG`, and drop the `--org` argument. Keep `FLYCTL_BIN` (default `flyctl`). `FLY_API_TOKEN`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` are still read from the process environment.
  - Keep unchanged: the exported `shouldAttachPostgres` and `buildDeploySecrets` and their behaviour; the staged secret write (`flyctl secrets set --app <app> --stage`) followed by the deploy; the refusal when the deployed secret list cannot be read; the refusal when the attach step fails; the rule that the engine never writes a `DATABASE_URL` secret (the attach step is the only mechanism that sets the deployed database address, and it runs only when the deployed secret list has no `DATABASE_URL`); the printed line naming the app and the email whose credential pair is stored, with no password value and no token value in any output; the guard that runs `main()` only when the script is executed directly.
  Verify with (the environment must be scrubbed first, exactly as written):
  ```
  env -u ADMIN_EMAIL -u ADMIN_PASSWORD -u FLY_API_TOKEN -u DATABASE_URL node --input-type=module -e "const m = await import('file://' + process.cwd() + '/scripts/deploy.ts'); console.log(Object.keys(m).sort().join(', '))"
  ```
  Expected output, exit 0:
  ```
  buildDeploySecrets, resolveEnvironment, shouldAttachPostgres
  ```
- [x] 2.2 Update `tests/unit/deploy.test.ts` (after 2.1; not parallel-safe) for the new decision function. Changes:
  - Keep the four existing behaviour tests for `buildDeploySecrets` and `shouldAttachPostgres` unchanged.
  - The fixture email stays `deploy-test@example.com`. Never use `owner@example.com` in this file.
  - Add exactly three tests for `resolveEnvironment`: (a) `"prod"` returns the production row exactly; (b) `"stage"` returns the pre-production row exactly; (c) a name that is neither `prod` or `stage` (for example `"production"`) returns `undefined`.
  - Update the export-list test: the sorted export list is exactly `buildDeploySecrets`, `resolveEnvironment`, `shouldAttachPostgres`, and the test name says "three decision functions".
  Verify with: `npm test`. Expected output includes, with exit 0:
  ```
  Test Files  12 passed (12)
  Tests  119 passed (119)
  ```

## 3. npm scripts

- [x] 3.1 Remove the remote deploy npm script from `package.json` (parallel-safe). Delete exactly the line `"deploy": "node --env-file-if-exists=.env scripts/deploy.ts",` from `scripts`. Keep all 16 remaining scripts unchanged: `dev`, `setup`, `build`, `start`, `typecheck`, `test`, `test:watch`, `db:up`, `db:down`, `test:integration`, `storybook`, `build-storybook`, `test:storybook`, `test:storybook:update`, `owner:reset`, `verify`. Verify with: `grep -n '"deploy"' package.json`. Expected: no match, exit 1.

## 4. Pipelines

- [x] 4.1 Create `.github/workflows/deploy-prod.yml` (parallel-safe). The production pipeline, using the shared shape from design D-4 with the production values:
  - `on.pull_request_target`: types `[closed]`, branches `[main]`, written inline as `branches: [main]`.
  - `permissions`: `contents: read`. `concurrency`: group `deploy-prod`, `cancel-in-progress: false`.
  - Job `deploy`: `if: github.event.pull_request.merged == true`, `runs-on: ubuntu-latest`, `timeout-minutes: 15`.
  - Steps, in order: checkout the merged commit (`ref: ${{ github.event.pull_request.merge_commit_sha }}`); `actions/setup-node@v4` with `node-version: 24`; `npm ci`; `npm run typecheck`; `npm test`; `superfly/flyctl-actions/setup-flyctl@master`; the deploy step `node scripts/deploy.ts prod --config fly.prod.toml` with an `env:` block mapping `FLY_API_TOKEN` to `${{ secrets.FLY_API_TOKEN_PROD }}`, `ADMIN_EMAIL` to `${{ secrets.ADMIN_EMAIL_PROD }}`, `ADMIN_PASSWORD` to `${{ secrets.ADMIN_PASSWORD_PROD }}`.
  - No `services:` block and no browser suite step. No reference to any `_STAGE` secret.
  Verify with: `grep -oE 'branches: \[main\]|group: deploy-prod|node scripts/deploy\.ts prod --config fly\.prod\.toml|secrets\.(FLY_API_TOKEN_PROD|ADMIN_EMAIL_PROD|ADMIN_PASSWORD_PROD)' .github/workflows/deploy-prod.yml`. Expected output, in this order, exit 0:
  ```
  branches: [main]
  group: deploy-prod
  node scripts/deploy.ts prod --config fly.prod.toml
  secrets.FLY_API_TOKEN_PROD
  secrets.ADMIN_EMAIL_PROD
  secrets.ADMIN_PASSWORD_PROD
  ```
- [x] 4.2 Create `.github/workflows/deploy-stage.yml` (parallel-safe). The pre-production pipeline, using the shared shape from design D-4 with the pre-production values:
  - `on.pull_request_target`: types `[closed]`, branches `[develop]`, written inline as `branches: [develop]`.
  - `concurrency`: group `deploy-stage`. Job `deploy`: `timeout-minutes: 30` (estimate; higher than the production job to cover the browser suite, per the design risk note).
  - A `services:` block with `db`: image `postgres:16`, env `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` all `blog`, port `5432:5432`, and the health check written out in `options:` as `--health-cmd "pg_isready -U blog -d blog" --health-interval 10s --health-timeout 5s --health-retries 5`, matching the local Postgres service in `docker-compose.yml`.
  - Steps, in order: checkout the merged commit; `actions/setup-node@v4` with `node-version: 24`; `npm ci`; `npm run typecheck`; `npm test`; `npx playwright install --with-deps chromium` (the hosted runner needs the system libraries); `npm run test:integration`; `superfly/flyctl-actions/setup-flyctl@master`; the deploy step `node scripts/deploy.ts stage --config fly.stage.toml` with an `env:` block mapping `FLY_API_TOKEN` to `${{ secrets.FLY_API_TOKEN_STAGE }}`, `ADMIN_EMAIL` to `${{ secrets.ADMIN_EMAIL_STAGE }}`, `ADMIN_PASSWORD` to `${{ secrets.ADMIN_PASSWORD_STAGE }}`.
  - The `npm run test:integration` step sets only `DATABASE_URL=postgres://blog:blog@localhost:5432/blog`. The browser suite signs in with the fixed test account from `tests/integration/test-account.ts`, which the Playwright configuration uses by default. Do not set `ADMIN_EMAIL` or `ADMIN_PASSWORD` on that step, and do not map a live credential pair onto it.
  - No reference to any `_PROD` secret.
  Verify with: `grep -oE 'branches: \[develop\]|group: deploy-stage|image: postgres:16|--health-cmd "pg_isready -U blog -d blog"|npx playwright install --with-deps chromium|node scripts/deploy\.ts stage --config fly\.stage\.toml|secrets\.(FLY_API_TOKEN_STAGE|ADMIN_EMAIL_STAGE|ADMIN_PASSWORD_STAGE)' .github/workflows/deploy-stage.yml`. Expected output, in this order, exit 0:
  ```
  branches: [develop]
  group: deploy-stage
  image: postgres:16
  --health-cmd "pg_isready -U blog -d blog"
  npx playwright install --with-deps chromium
  node scripts/deploy.ts stage --config fly.stage.toml
  secrets.FLY_API_TOKEN_STAGE
  secrets.ADMIN_EMAIL_STAGE
  secrets.ADMIN_PASSWORD_STAGE
  ```
- [x] 4.3 Delete `.github/workflows/deploy.yml` (parallel-safe). Remove the old single-pipeline workflow; the two files from 4.1 and 4.2 replace it. Verify with: `ls .github/workflows/deploy.yml`. Expected output, exit 2:
  ```
  ls: cannot access '.github/workflows/deploy.yml': No such file or directory
  ```

## 5. Local commands

- [x] 5.1 Remove the Fly.io mode from `scripts/install.ts` (parallel-safe), per design D-6. Remove mode 2: the mode-selection question, the `FLY_*` entries it writes to `.env`, the `fly.toml` read and update, and the prompt that can run the removed deploy; drop the helpers and imports that only mode 2 used. Keep mode 1 unchanged: it generates the local credential pair randomly, copies an existing `.env` to `.env.backup-<timestamp>` first, and writes `DATABASE_URL`, `PORT`, `NODE_ENV`, `COOKIE_SECURE`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` to `.env`. Verify with: `grep -cnE 'FLY_|fly\.toml|Fly\.io|npm run deploy' scripts/install.ts`. Expected output, exit 1:
  ```
  0
  ```

## 6. Documentation

- [x] 6.1 Update `README.md` (parallel-safe), per design D-7. Changes:
  - Installer section: describe the local mode only (no Fly.io mode, no `fly.toml` editing, no deploy offer).
  - Commands table: drop the `npm run deploy` row; the `setup` row describes writing a local `.env` only.
  - Environment variables table: drop the `FLY_APP`, `FLY_REGION`, `FLY_ORG`, and `FLY_POSTGRES_APP` rows; keep `FLY_API_TOKEN` and `FLYCTL_BIN`, described as deploy-engine inputs supplied by the pipeline.
  - Deployment sections (`Deployment to Fly.io` and `GitHub Actions deployment`): rewrite for pipeline-only deploys. State the two environments and apps (`danorz-com-blog-prod` at `https://danorz-com-blog-prod.fly.dev`, `danorz-com-blog-stage` at `https://danorz-com-blog-stage.fly.dev`), the two configuration files (`fly.prod.toml`, `fly.stage.toml`), the two app-scoped tokens (`FLY_API_TOKEN_PROD`, `FLY_API_TOKEN_STAGE`), the merge triggers (a merge into `main` deploys production, a merge into `develop` deploys pre-production), and point to the Migration Plan in `openspec/changes/fly-dual-environment-deploys/design.md`. Remove every `npm run deploy` invocation and every `fly.toml` reference.
  - `owner:reset` production form: the `fly ssh console` command names `danorz-com-blog-prod`.
  Verify with: `grep -nE 'fly\.toml|npm run deploy|FLY_APP|FLY_REGION|FLY_ORG|FLY_POSTGRES_APP' README.md`. Expected: no match, exit 1.
- [x] 6.2 Update `.env.example` (parallel-safe). Drop the `FLY_*` block (the `FLY_APP`, `FLY_REGION`, `FLY_POSTGRES_APP`, `FLY_API_TOKEN`, and `FLYCTL_BIN` lines and the blank line that separates the block). Keep `DATABASE_URL`, `PORT`, `NODE_ENV`, `COOKIE_SECURE`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`. No locally-run deploy remains. Verify with: `grep -n 'FLY_' .env.example`. Expected: no match, exit 1.

## 7. Credential file exclusions

- [x] 7.1 Append the credential file names to `.gitignore` (parallel-safe with 7.2). The two credential files are untracked and not ignored today, so a broad `git add -A` commits both admin passwords. Append a section that names both files exactly:
  ```
  # Credential files
  admin-creds.dotenv
  admin-creds-stage.dotenv
  ```
  The files stay in place (removing them is the deferred cleanup); only the ignore rules change. Verify with: `git check-ignore -q admin-creds.dotenv && echo ignored`. Expected output, exit 0:
  ```
  ignored
  ```
- [x] 7.2 Append the credential file names to `.dockerignore` (parallel-safe with 7.1). The Dockerfile build stage runs `COPY . .`, and every remote build, which is every pipeline deploy, currently uploads both credential files into the image registry. Append the same two names:
  ```
  admin-creds.dotenv
  admin-creds-stage.dotenv
  ```
  The build context then excludes both files, and the remote build no longer uploads them. Verify with: `grep -nE 'admin-creds' .dockerignore`. Expected output, exit 0: exactly two matching lines, one naming `admin-creds.dotenv` and one naming `admin-creds-stage.dotenv`.

## 8. Verification

Run every item only after all tasks in sections 1-7 are complete.

- [x] 8.1 Run `npm run verify`. Expected, exit 0: the typecheck prints no errors; the vitest summary shows `Test Files  12 passed (12)` and `Tests  119 passed (119)`; the React Router production build completes.
- [x] 8.2 Run `npx playwright test --list`. Expected, exit 0: the 50 browser tests are listed; the last line is `Total: 50 tests in 5 files`.
- [x] 8.3 Scoped search, Fly configuration files: run `ls fly*.toml`. Expected, exit 0:
  ```
  fly.prod.toml
  fly.stage.toml
  ```
  exactly two files, and none named `fly.toml`.
- [x] 8.4 Scoped search, workflow files: run `ls .github/workflows/`. Expected, exit 0:
  ```
  deploy-prod.yml
  deploy-stage.yml
  ```
- [x] 8.5 Scoped search, no deploy npm script: run `grep -n '"deploy"' package.json`. Expected: no match, exit 1.
- [x] 8.6 Scoped search, no pre-production secrets in the production pipeline: run `grep -nE 'FLY_API_TOKEN_STAGE|ADMIN_EMAIL_STAGE|ADMIN_PASSWORD_STAGE' .github/workflows/deploy-prod.yml`. Expected: no match, exit 1.
- [x] 8.7 Scoped search, no production secrets in the pre-production pipeline: run `grep -nE 'FLY_API_TOKEN_PROD|ADMIN_EMAIL_PROD|ADMIN_PASSWORD_PROD' .github/workflows/deploy-stage.yml`. Expected: no match, exit 1.
- [x] 8.8 Scoped search, no `FLY_` variables in `.env.example`: run `grep -n 'FLY_' .env.example`. Expected: no match, exit 1.
- [x] 8.9 Scoped search, no old deploy references in `README.md`: run `grep -nE 'fly\.toml|npm run deploy' README.md`. Expected: no match, exit 1.
- [x] 8.10 Scoped search, unit test fixture email present: run `grep -n 'deploy-test@example.com' tests/unit/deploy.test.ts`. Expected: a match appears, exit 0.
- [x] 8.11 Scoped search, unit test fixture email is not the owner address: run `grep -n 'owner@example.com' tests/unit/deploy.test.ts`. Expected: no match, exit 1.
- [x] 8.12 Scoped search, `--yes` appears only where flyctl 0.5.4 accepts it: run `grep -n '"--yes"' scripts/deploy.ts`. Expected, exit 0: exactly two matching lines — the `apps create` argument array and the deploy command's `"--yes",` argument. In particular, the `postgres attach` argument array is not among them.
- [x] 8.13 Scoped search, the pre-production credential file is ignored too: run `git check-ignore -q admin-creds-stage.dotenv && echo ignored`. Expected output, exit 0:
  ```
  ignored
  ```
- [x] 8.14 Run `openspec validate fly-dual-environment-deploys --strict`. Expected output, exit 0:
  ```
  Change 'fly-dual-environment-deploys' is valid
  ```
- [x] 8.15 Refusal proof, missing environment name. Run with the environment scrubbed:
  ```
  env -u ADMIN_EMAIL -u ADMIN_PASSWORD -u FLY_API_TOKEN -u DATABASE_URL node scripts/deploy.ts
  ```
  Expected output, exit 1:
  ```
  The first argument must be an environment name. Accepted names: prod, stage. No app was created and no secret was written. Run the deploy with one of these commands:
  node scripts/deploy.ts prod --config fly.prod.toml
  node scripts/deploy.ts stage --config fly.stage.toml
  ```
  The refusal prints the two accepted names. No deploy tool is contacted.
- [x] 8.16 Refusal proof, wrong environment name. Run with the environment scrubbed:
  ```
  env -u ADMIN_EMAIL -u ADMIN_PASSWORD -u FLY_API_TOKEN -u DATABASE_URL node scripts/deploy.ts bogus
  ```
  Expected output, exit 1:
  ```
  The first argument must be an environment name. Accepted names: prod, stage. No app was created and no secret was written. Run the deploy with one of these commands:
  node scripts/deploy.ts prod --config fly.prod.toml
  node scripts/deploy.ts stage --config fly.stage.toml
  ```
  The refusal prints the two accepted names. No deploy tool is contacted.
- [x] 8.17 Refusal proof, missing credential pair. Run with the environment scrubbed:
  ```
  env -u ADMIN_EMAIL -u ADMIN_PASSWORD -u FLY_API_TOKEN -u DATABASE_URL node scripts/deploy.ts prod
  ```
  Expected output, exit 1:
  ```
  Missing required environment variables: FLY_API_TOKEN, ADMIN_EMAIL, ADMIN_PASSWORD.
  The admin credential pair is ADMIN_EMAIL and ADMIN_PASSWORD; missing from the pair: ADMIN_EMAIL, ADMIN_PASSWORD. Run the deploy with one of these commands:
  node scripts/deploy.ts prod --config fly.prod.toml
  node scripts/deploy.ts stage --config fly.stage.toml
  Set the missing variables in the environment, then run the deploy again.
  ```
  The refusal names the missing variables and names both `ADMIN_EMAIL` and `ADMIN_PASSWORD` as missing from the pair. No deploy tool is contacted.
- [x] 8.18 Refusal proof, mismatched configuration file. Run with the environment scrubbed:
  ```
  env -u ADMIN_EMAIL -u ADMIN_PASSWORD -u FLY_API_TOKEN -u DATABASE_URL node scripts/deploy.ts prod --config fly.stage.toml
  ```
  Expected output, exit 1:
  ```
  Missing required environment variables: FLY_API_TOKEN, ADMIN_EMAIL, ADMIN_PASSWORD.
  The admin credential pair is ADMIN_EMAIL and ADMIN_PASSWORD; missing from the pair: ADMIN_EMAIL, ADMIN_PASSWORD. Run the deploy with one of these commands:
  node scripts/deploy.ts prod --config fly.prod.toml
  node scripts/deploy.ts stage --config fly.stage.toml
  Set the missing variables in the environment, then run the deploy again.
  ```
  With the environment scrubbed, the missing-variable check in `main()` runs before the `--config` check, so the credential refusal prints first and the config-mismatch message (`The --config value fly.stage.toml does not match the prod environment. Expected fly.prod.toml.`) is not reached. No deploy tool is contacted.

## Operator runbook

An agent must not run any item in this section without the operator running it. Every item changes the deployed world: it creates or destroys a Fly app
or database app, writes or removes a GitHub repository secret, mints or
revokes a token, runs a deploy through a merge, or changes a repository
setting. The operator runs the flyctl steps with an account-level token.
Order is fixed; each item states its rollback. Source: the Migration Plan in
`design.md`. flyctl 0.5.4 has no `fly postgres destroy` and no
`fly postgres snapshot`: a Postgres app is an app, so `fly apps destroy`
destroys it, and a database snapshot is a volume snapshot.

- [ ] 9.1 Create the production app and database.
  - `fly apps create danorz-com-blog-prod`
  - `fly postgres create --name danorz-com-blog-prod-db --region iad --vm-size shared-cpu-1x --volume-size 1 --initial-cluster-size 1`
  - `fly postgres attach danorz-com-blog-prod-db --app danorz-com-blog-prod` by hand, so the generated database role password is visible; record it. The attach command takes no confirmation flag (flyctl 0.5.4's `postgres attach` has no `--yes` flag). Because the runbook attaches by hand, the engine's attach path, a fallback, should not fire on the first deploy.
  - Mint the app-scoped token and set the three repository secrets. The token value is extracted from the JSON output and piped into `gh secret set`, so it never appears in a terminal, a log, or a file:
    ```
    flyctl tokens create deploy -a danorz-com-blog-prod -x 8760h -j | jq -jr '.token' | gh secret set FLY_API_TOKEN_PROD -R orzechowskid/oneshot-blog
    sed -n 's/^export ADMIN_EMAIL=//p' admin-creds.dotenv    | tr -d '\n' | gh secret set ADMIN_EMAIL_PROD
    sed -n 's/^export ADMIN_PASSWORD=//p' admin-creds.dotenv | tr -d '\n' | gh secret set ADMIN_PASSWORD_PROD
    ```
    Do not use `gh secret set --env-file`: it would create secrets named `ADMIN_EMAIL` and `ADMIN_PASSWORD`, not the per-environment names.
  - Changes in the deployed world: creates the Fly app `danorz-com-blog-prod` and the Postgres app `danorz-com-blog-prod-db` (1 GiB, region `iad`); the attach step sets the `DATABASE_URL` secret on the new app; three new repository secrets exist.
  - Rollback: `fly apps destroy danorz-com-blog-prod-db --yes`; `fly apps destroy danorz-com-blog-prod --yes`; `gh secret remove` the three secrets; revoke the token. Nothing else is touched.
- [ ] 9.2 Deploy the production app by merge. Open a pull request from the change branch into `main` and merge it. The production pipeline runs the typecheck, the unit suite, then `node scripts/deploy.ts prod --config fly.prod.toml`. The engine probes the app with `flyctl status --app danorz-com-blog-prod --json`, finds the app and the `DATABASE_URL` secret already present, stores the pair as staged secrets, deploys, and waits for `https://danorz-com-blog-prod.fly.dev/health`. The same merge replaces `.github/workflows/deploy.yml` with `deploy-prod.yml` and `deploy-stage.yml`. Measure the release count before the merge and after the run with `flyctl releases --app danorz-com-blog-prod -j --jq 'length'`; the count increases by one. After a successful run, remove the now-unused `FLY_API_TOKEN` secret: `gh secret remove FLY_API_TOKEN`.
  - Changes in the deployed world: the release count for `danorz-com-blog-prod` increases by one; the pipeline definitions in the repository are replaced; the old shared token secret is removed.
  - Rollback: the old app keeps serving throughout; fix the commit and merge again, or destroy the new app and redo 9.1. The new app holds no user data.
- [ ] 9.3 Prove production sign-in.
  - Post-deploy check: `flyctl secrets list --app danorz-com-blog-prod` shows `ADMIN_EMAIL` and `ADMIN_PASSWORD` alongside `DATABASE_URL` (the staged pair landed with the deploy). The check confirms the pair landed; the sign-in proof is the real gate.
  - Sign-in proof: the login form has the fields `email` and `password`; success is 302 with Location `/admin`; 400 is a field error, 401 is bad credentials; cross-site request protection is header-based, so a plain form post passes. Run the proof without printing the password: no `-v`, no `-D -`, no `set -x`, no `-f`.
    ```
    set -a; . ./admin-creds.dotenv; set +a
    curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' --data-urlencode "email=$ADMIN_EMAIL" --data-urlencode "password=$ADMIN_PASSWORD" https://danorz-com-blog-prod.fly.dev/login
    ```
    Expected output: `302 /admin`.
  - Changes in the deployed world: none; this is a read-only proof and a gate for 9.8. Do not continue after a failure; fix and redeploy first.
- [ ] 9.4 Create the pre-production app and database.
  - The three commands from 9.1 with the stage names: `fly apps create danorz-com-blog-stage`; `fly postgres create --name danorz-com-blog-stage-db --region iad --vm-size shared-cpu-1x --volume-size 1 --initial-cluster-size 1`; `fly postgres attach danorz-com-blog-stage-db --app danorz-com-blog-stage` by hand, with no confirmation flag.
  - Mint the stage token and set the three stage secrets, the values never printed:
    ```
    flyctl tokens create deploy -a danorz-com-blog-stage -x 8760h -j | jq -jr '.token' | gh secret set FLY_API_TOKEN_STAGE -R orzechowskid/oneshot-blog
    sed -n 's/^export ADMIN_EMAIL=//p' admin-creds-stage.dotenv    | tr -d '\n' | gh secret set ADMIN_EMAIL_STAGE
    sed -n 's/^export ADMIN_PASSWORD=//p' admin-creds-stage.dotenv | tr -d '\n' | gh secret set ADMIN_PASSWORD_STAGE
    ```
  - Create the `develop` branch from the head of `main` after the 9.2 merge into `main`, not from the commit before it, so the two branch histories are identical and later develop-to-main pull requests show only the new diff: `git branch develop main && git push origin develop`.
  - Changes in the deployed world: creates the Fly app `danorz-com-blog-stage` and the Postgres app `danorz-com-blog-stage-db` (1 GiB, region `iad`); the attach step sets the `DATABASE_URL` secret on the stage app; three new stage repository secrets exist; the repository gains the `develop` branch.
  - Rollback: `fly apps destroy danorz-com-blog-stage-db --yes`; `fly apps destroy danorz-com-blog-stage --yes`; `gh secret remove` the three stage secrets; revoke the token; delete the `develop` branch.
- [ ] 9.5 Deploy the pre-production app by merge. Because 9.4 created `develop` from the head of `main` after the cutover, `develop` and `main` hold identical histories, and a pull request from the change branch into `develop` would be up to date and could not merge. The first merge into `develop` is the documentation follow-up: open a pull request into `develop` with the `README.md` and `.env.example` changes from design D-7 and merge it. The stage pipeline runs the typecheck, the unit suite, the browser suite against the pipeline's own Postgres service container (the fixed test account from `tests/integration/test-account.ts`; the step sets only `DATABASE_URL`, no live credential pair), then `node scripts/deploy.ts stage --config fly.stage.toml`. Measure the release count before the merge and after the run with `flyctl releases --app danorz-com-blog-stage -j --jq 'length'`; the count increases by one.
  - Changes in the deployed world: the release count for `danorz-com-blog-stage` increases by one; the documentation files change on `develop`.
  - Rollback: the old app keeps serving; revert the commit through a pull request into `develop`, which re-runs the stage pipeline and re-deploys stage. The stage app holds no user data.
- [ ] 9.6 Prove pre-production sign-in.
  - Post-deploy check: `flyctl secrets list --app danorz-com-blog-stage` shows `ADMIN_EMAIL` and `ADMIN_PASSWORD` alongside `DATABASE_URL`.
  - Sign-in proof: the same form, the same no-print rules (no `-v`, no `-D -`, no `set -x`, no `-f`), with the stage pair and the stage address:
    ```
    set -a; . ./admin-creds-stage.dotenv; set +a
    curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' --data-urlencode "email=$ADMIN_EMAIL" --data-urlencode "password=$ADMIN_PASSWORD" https://danorz-com-blog-stage.fly.dev/login
    ```
    Expected output: `302 /admin`.
  - Changes in the deployed world: none; this is a read-only proof and a gate for 9.8.
- [ ] 9.7 Snapshot the old database (insurance, optional). flyctl 0.5.4 has no `fly postgres snapshot`; the snapshot is a volume snapshot:
  - `flyctl volume list --app oneshot-blog-db` to read the volume id.
  - `flyctl volume snapshots create <volume-id> --app oneshot-blog-db`.
  - `flyctl volume snapshots list <volume-id> --app oneshot-blog-db` as the proof: the new snapshot appears in its output.
  A volume snapshot of a running database is a block copy, not a consistent dump. By the owner's decision the step is insurance, optional, and not a restore path.
  - Changes in the deployed world: adds a snapshot to the volume of `oneshot-blog-db`.
  - Rollback: none needed; the step is additive.
- [ ] 9.8 Destroy the old app and the old database app (irreversible). Only after 9.3 and 9.6 passed:
  - `fly apps destroy oneshot-blog-db --yes`
  - `fly apps destroy oneshot-blog --yes`
  flyctl 0.5.4 has no `fly postgres destroy`; a Postgres app is an app, so the same command destroys it.
  Consequence: destroying `oneshot-blog` releases the global hostname `oneshot-blog.fly.dev` to the public namespace; old readers lose the address.
  - Changes in the deployed world: removes the old app and the old database app, and releases the old public address. This step is irreversible; the snapshot from 9.7 is the only insurance, and by owner decision it is not a restore path.
  - Rollback: none.
- [ ] 9.9 Retire the old app's deploy tokens. Measured: two deploy tokens scoped to the old app exist.
  - `flyctl tokens list --scope app -a oneshot-blog` to read the two token ids.
  - `flyctl tokens revoke <id> <id>` with the two ids.
  - Changes in the deployed world: both old app-scoped tokens are revoked and can no longer call the Fly API.
  - Rollback: none; a revoked token cannot be restored. The app the tokens were scoped to no longer exists, so no token is needed in its place.
- [ ] 9.10 Set the repository default branch to `develop`: `gh repo edit orzechowskid/oneshot-blog --default-branch develop`.
  - Changes in the deployed world: the repository default branch moves from `main` to `develop`; new clones and new pull requests default to `develop`.
  - Rollback: set the default branch back to `main`.
- [ ] 9.11 Apply branch protection on `main`: pull request required, no direct push, no force push, required approving review count 0. The count is 0, not 1: the repository has one author, and GitHub does not let an author approve their own pull request, so a required review of one would make the production deploy permanently unreachable. Write `protection.json`:
  ```json
  {
    "required_status_checks": null,
    "enforce_admins": true,
    "required_pull_request_reviews": {
      "required_approving_review_count": 0,
      "dismiss_stale_reviews": true,
      "require_code_owner_reviews": false
    },
    "restrictions": null,
    "required_linear_history": false,
    "allow_force_pushes": false,
    "allow_deletions": false
  }
  ```
  and apply it: `gh api -X PUT repos/orzechowskid/oneshot-blog/branches/main/protection --input protection.json`. Read-only proof: `gh api repos/orzechowskid/oneshot-blog/branches/main/protection --jq '{enforce_admins:.enforce_admins.enabled, approvals:.required_pull_request_reviews.required_approving_review_count, force_push:.allow_force_pushes.enabled, deletions:.allow_deletions.enabled}'`. Expected output: `{"enforce_admins":true,"approvals":0,"force_push":false,"deletions":false}`.
  - Changes in the deployed world: the branch protection rules on `main`.
  - Rollback: remove the protection rule.
- [ ] 9.12 Regenerate the local development credential pair. Run `npm run setup` (local mode); it writes a new random pair to `.env` and backs up the old `.env` first. Run `npm run owner:reset` to apply the pair to the local database's single admin row.
  - Changes in the deployed world: none; only the local `.env` and the local database change.
  - Rollback: restore `.env` from the `.env.backup-<timestamp>` file created by setup; the local database can be reset with `scripts/reset-db.ts`.

## Verification evidence

The measured record for every verification and refusal proof in sections 1-8 is `openspec/changes/fly-dual-environment-deploys/verification.md`: each command, its exit status, and its output as printed.

The Operator runbook section has not been run.

## Base-branch rule for pipeline files

Operational facts measured during the live migration, in order:

1. A `pull_request_target` pipeline uses the workflow files as they exist in the base branch before the merge, not the files in the merge commit.
2. Consequence for this migration: the merge that installs `deploy-prod.yml` and `deploy-stage.yml` into `main` cannot run `deploy-prod.yml`, because `main` does not contain that file at the moment the event is evaluated. That merge runs the workflow that `main` held before the merge, which is the retired single workflow, and it fails because `fly.toml` no longer exists. Measured on the live repository: the merge of pull request 2 produced one failing run named Deploy to Fly.io, and no run of `deploy-prod.yml`.
3. The production deploy therefore needs a second merge into `main`, made after `deploy-prod.yml` exists in `main`. Measured: the merge of pull request 3 ran `deploy-prod.yml`.
4. For `develop` the rule works in favour of the operator: `develop` is created from the post-cutover `main`, so it already contains `deploy-stage.yml`, and the first merge into `develop` runs the stage pipeline.
5. The corrected order for the operator: merge the cutover into `main`, expect the retired workflow to fail, create `develop` from that `main`, then deploy production with a further small merge into `main`, then deploy stage with a merge into `develop`.
6. The measured blocker found on that deploy run: the Install dependencies step ran `npm ci` and failed with `EUSAGE` because `package.json` and `package-lock.json` were not in sync, naming `@emnapi/core@1.11.3` and `@emnapi/runtime@1.11.3` as missing from the lock file. The fix is a lock file in sync, proven by `npm ci --dry-run` exiting 0.
