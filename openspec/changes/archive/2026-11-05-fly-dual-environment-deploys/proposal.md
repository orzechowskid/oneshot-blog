# Proposal: fly-dual-environment-deploys

## Why

The last two production faults were caused by a laptop deploy and by a script
that wrote a deployed database address. Deploys must be pipeline-driven, and
pre-production must exercise the deploy path before production.

## What Changes

- **BREAKING**: one Fly app becomes two: `danorz-com-blog-prod` (production)
  and `danorz-com-blog-stage` (pre-production), each with its own Postgres app
  and public address. The old apps are destroyed after the new production app
  is verified by a successful sign-in.
- **BREAKING**: deploys move to the continuous integration pipeline: a merge to
  `develop` deploys pre-production, a merge to `main` deploys production. Both
  run the typecheck and the unit suite first; the pre-production pipeline also
  runs the browser suite.
- **BREAKING**: the local remote deploy command (`npm run deploy`) is
  removed; the deploy engine runs only from the pipeline with an explicit
  environment name.
- **BREAKING**: the Fly configuration file `fly.toml` is replaced by two named
  files, one per environment, with no default configuration file.
- Two app-scoped Fly API tokens replace the single repository-wide token.
- The local development admin credential pair is regenerated with new values.
  The production pair stays only in `admin-creds.dotenv`; the pre-production
  pair only in `admin-creds-stage.dotenv`.

## Capabilities

### New Capabilities

- `deployment-pipeline`: how a merge to `develop` or `main` runs the deploy for
  that environment, what gates it, and how the pipeline stores the
  per-environment credential pairs.

### Modified Capabilities

- `admin-credentials`: the deploy script runs from the pipeline with an
  explicit environment name, stores the per-environment credential pair, and
  is no longer runnable from a laptop.

## Non-goals

- No password change inside the app.
- The deferred file cleanups stay deferred: `admin-creds.dotenv`,
  `admin-creds-stage.dotenv`, the `.env.backup-*` files, the extra database
  role, and the machine sign-in credentials.
- The unrelated `markdown-draft-editor` branch and change folder are untouched.
- No custom domain work.

## Impact

- Fly: two new app pairs; the old apps are destroyed after verification.
- Pipeline: merge triggers and test gates replace the pull-request trigger in
  `deploy.yml`; `FLY_API_TOKEN` is replaced by two app-scoped tokens and the
  per-environment credential pairs.
- Repository: two named Fly configuration files replace `fly.toml`; the
  `deploy` npm script is removed; local commands are unchanged.
