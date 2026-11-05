# Decision record: fly-dual-environment-deploys

Date: 5 November 2026. The owner answered ten questions, then delegated the rest and
asked for a report of the assumptions and decisions made in their absence.

## Owner decisions

1. Destroy both current apps. "we're starting over". No data is preserved as a
   requirement: the production database holds one admin row, zero posts and one
   session row.
2. Build and verify the new production app, sign in to it, and destroy the old apps
   afterwards.
3. New production app: `danorz-com-blog-prod`. Initial admin address and password come
   from `~/repos/oneshot-blog/admin-creds.dotenv`.
4. New pre-production app: `danorz-com-blog-stage`. Initial admin address and password
   come from `~/repos/oneshot-blog/admin-creds-stage.dotenv`.
5. Default branch of the GitHub repository becomes `develop`.
6. Merge into `develop` deploys the pre-production app. Merge into `main` deploys the
   production app.
7. `main` has branch protection: pull request merge only, no direct push.
8. Test scope in the deploy pipeline: typecheck and the unit suite gate every deploy;
   the browser suite runs in the pre-production pipeline only.
9. Two separate Fly configuration files, one per environment, and no default
   configuration file.
10. No locally-run remote deploy commands. The old `npm run deploy` command is
    removed. Deployment happens through the continuous integration pipeline only.
    Local development functionality is preserved: local database start, dev server,
    production-style start, build, typecheck, unit tests, browser tests, the local
    database reset script, the admin credential reset command, and the setup script.
11. Two Fly API tokens, one scoped to each app.
12. A public pre-production address is acceptable.
13. The local development admin credential pair is regenerated with new values. The
    production credential pair stays only in `admin-creds.dotenv`.
14. Database capacity: one gigabyte volume per environment.

## Agent assumptions made in the owner's absence

These are the agent's choices, not owner decisions. Each is reversible.

1. The deploy engine stays in the repository as a script that the pipeline runs with an
   explicit environment name. It is not exposed as an npm command, so nothing can
   deploy by accident from a laptop. The pipeline runs it with the environment name and
   the matching Fly configuration file.
2. The deploy engine keeps the rules that are already specified: it writes only the
   admin credential pair as secrets, it never writes a database-address secret, the
   database address is set only by the Fly Postgres attach step, and it refuses with a
   hand-run instruction when it cannot read the deployed app's secret names.
3. The pipeline needs the credential pair in order to store it, so the repository
   secrets are: `FLY_API_TOKEN_PROD`, `FLY_API_TOKEN_STAGE`, `ADMIN_EMAIL_PROD`,
   `ADMIN_PASSWORD_PROD`, `ADMIN_EMAIL_STAGE`, `ADMIN_PASSWORD_STAGE`.
4. The two app-scoped tokens are created with the deploy tool's own token command after
   each app exists, and are written into the repository secrets without printing them.
5. Database app names are `danorz-com-blog-prod-db` and `danorz-com-blog-stage-db`,
   region `iad`, one gigabyte each.
6. A snapshot of the old production database is taken before the old apps are destroyed.
   It is insurance only; nothing is restored from it.
7. The old apps are destroyed only after the new production app is verified by a
   successful sign-in with the production credential.
8. Branch protection on `main`: required pull request review merge, no force push, no
   direct push. The owner asked for pull request merge only; the exact rule set is the
   agent's choice.
9. The GitHub Actions pipeline installs Node 24, because the project requires it.
10. The browser suite in the pre-production pipeline runs against a PostgreSQL service
    container provided by the pipeline.
11. The local development credential pair is generated randomly by the setup script, as
    it always has been, and written to `.env`.
12. The file `fly.toml` is deleted, because the owner chose no default configuration.
13. The files `admin-creds.dotenv`, `admin-creds-stage.dotenv` and the `.env.backup-*`
    files are left in place. The owner deferred that cleanup.
14. The unrelated feature branch and change folder named `markdown-draft-editor` are
    left untouched.
15. The existing Fly app credential reset path is unchanged: the server creates the
    admin account from the two secrets when the database is empty, and the reset command
    rotates it afterwards. No seeding route and no seed token returns.

## Measured facts at the time of writing

- Deploy tool version: 0.5.4. It has a token command with `create`, `list` and
  `revoke`, and an app scope flag, so app-scoped tokens can be created from the
  command line.
- Fly apps today: `oneshot-blog` (suspended, latest deploy 11 minutes ago) and
  `oneshot-blog-db` (deployed).
- Production app has no custom domain and no certificate.
- The current pipeline file is `.github/workflows/deploy.yml`. It triggers on
  `pull_request_target` closed against `main`, deploys only when the pull request was
  merged, and runs the deploy tool's remote deploy with the repository secret
  `FLY_API_TOKEN`. It runs no test step.
- Repository default branch is `main`. Local branches: `main`, `markdown-draft-editor`.
  Remote: `git@github.com:orzechowskid/oneshot-blog.git`.
- `gh` version 2.103.3 is installed and authenticated as `orzechowskid`. Repository
  secrets today: `FLY_API_TOKEN`.
- Both credential files exist and each exports exactly the admin address and the admin
  password: `admin-creds.dotenv` and `admin-creds-stage.dotenv`.
- npm scripts today include `deploy` (the local remote-deploy command to be removed),
  `owner:reset`, `setup`, `dev`, `start`, `build`, `typecheck`, `test`, `db:up`,
  `db:down`, `test:integration` and `verify`.
- Unit suite: 12 files, 116 tests. Browser suite: 50 tests in 5 files.
- Site status before this change: home 200, login 200, health 200.

## Behaviour this change must produce

1. Two Fly apps, `danorz-com-blog-prod` and `danorz-com-blog-stage`, each with its own
   Postgres app attached by the deploy tool's attach step, each with its own admin
   credential pair stored as secrets, each reachable at its own public address.
2. A merge into `develop` runs the pre-production deploy. A merge into `main` runs the
   production deploy. Both run typecheck and the unit suite first. The pre-production
   pipeline also runs the browser suite.
3. The repository has two Fly configuration files and no default one. Any command that
   deploys names the environment it targets.
4. No npm command deploys to a remote environment. Local development and local
   verification commands are unchanged.
5. The old apps `oneshot-blog` and `oneshot-blog-db` are destroyed.
6. Nothing in the repository prints a credential value. The deploy engine prints the
   app name and the admin address it stores, as it does today.

## Review findings applied before implementation

A read-only reviewer measured the two tools on this machine, flyctl 0.5.4 and
gh 2.103.3, and found the plan unusable against the live account. The six fixes below
are agent decisions accepted from that review. None of them changes an owner decision.
The specification, design, and task files are revised to match. The measured facts the
reviewer produced are recorded after the fixes.

### The six accepted fixes, agent decisions

1. The destroy command form. flyctl 0.5.4 has no `fly postgres destroy`. A Postgres
   app is an app, so `flyctl apps destroy <app> --yes` destroys it. Every destruction
   and every rollback line in the runbook uses that form.
2. The attach flag. `fly postgres attach` has no `--yes` flag in flyctl 0.5.4. The
   attach command line is `flyctl postgres attach <db-app> --app <app>`. The attach
   call in `scripts/deploy.ts` no longer passes `--yes`, and the runbook runs the same
   line by hand.
3. The app status probe replacing the account-wide app list. An app-scoped deploy
   token (owner decision 11) cannot be assumed to list the whole account's apps, and
   the engine's first call was the account-wide app list. The engine now probes the
   app it is deploying with `flyctl status --app <app> --json`. The refusal behaviour
   is preserved: unreadable output means a hand-run instruction naming that command,
   exit 1, and nothing written. The rule that is preserved is the refusal on an
   unreadable read; the command used for the read is an agent choice.
4. The two ignore-file fixes. The Dockerfile build stage runs `COPY . .`, and
   `.dockerignore` excludes `.env`, `.env.*` and `.git`, not the credential files, so
   every remote build uploads `admin-creds.dotenv` and `admin-creds-stage.dotenv` into
   the image registry; both names are added to `.dockerignore`. The credential files
   are untracked and not ignored, so any `git add -A` commits both admin passwords;
   both names are added to `.gitignore`.
5. The branch protection review count of zero. The plan asked for one required
   approving review on `main`. This repository has one author, and GitHub does not let
   an author approve their own pull request, so production deploy would become
   permanently unreachable. The accepted rule set: pull request required, no direct
   push, no force push, required approving review count 0.
6. The develop-from-main-after-merge ordering. The `develop` branch is created from the
   head of `main` after the cutover merge into `main`, not from the commit before it:
   `git branch develop main && git push origin develop`, run after the merge. The two
   branch histories are then identical, and later develop-to-main pull requests show
   only the new diff.

### Measured facts from the review

flyctl 0.5.4, measured on this machine:

- `deploy` takes `-a, --app`, `-c, --config`, `--remote-only` and `-y, --yes`.
  `--remote-only` is the default in 0.5.4; keeping it is harmless.
- `secrets set` takes `-a, --app` and `--stage`. `--stage` sets the secrets and skips
  the deployment; the staged secrets land with the next deploy, and
  `flyctl secrets list --app <app>` is the post-deploy check.
- `postgres attach` flags are `-a/--app`, `-c/--config`, `--database-name`,
  `--database-user`, `--superuser`, `--variable-name`. There is no `--yes` flag.
- `tokens create deploy` takes `-a, --app` (the app scope), `-x, --expiry`,
  `-j, --json` and `-n, --name`. The default token expiry is 20 years; the runbook
  passes `-x 8760h`, one year.
- `releases` shows the release type, time, success and who triggered it, not a commit.
  The release count for an app is measured with
  `flyctl releases --app <app> -j --jq 'length'` before and after.
- `status` exists and takes `-a, --app` and `-j, --json`. It is the engine's probe.
- Volume snapshots: `flyctl volume list --app <db-app>` reads the volume id,
  `flyctl volume snapshots create <volume-id> --app <db-app>` takes the snapshot, and
  `flyctl volume snapshots list <volume-id> --app <db-app>` is the proof. flyctl 0.5.4
  has no `fly postgres snapshot`.
- `apps destroy` is `flyctl apps destroy <app> --yes`, and it is the only destroy
  command.

Secret values: `flyctl secrets list` prints each secret's name, a digest of its value,
and its deployment status. The actual value of a secret is only available to the
application; secret values cannot be read from the command line at all. The
command-checkable behaviour for a stored pair is therefore the sign-in proof at each
address with the pair from that environment's own credential file, expecting 302 and
the location `/admin`, plus `flyctl postgres list` showing both cluster names.

Sign-in, measured by the reviewer: the `/login` form has the fields `email` and
`password`. Success is HTTP 302 with Location `/admin`; HTTP 400 is a field error and
HTTP 401 is bad credentials. Cross-site request protection is header based, so a plain
form post passes. The proof command cannot print the password: no `-v`, no `-D -`, no
`set -x`, no `-f`.

```
set -a; . ./admin-creds.dotenv; set +a
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' --data-urlencode "email=$ADMIN_EMAIL" --data-urlencode "password=$ADMIN_PASSWORD" https://danorz-com-blog-prod.fly.dev/login
```

Expected output `302 /admin`. The same command with `admin-creds-stage.dotenv` and
`https://danorz-com-blog-stage.fly.dev/login` is the pre-production proof.

Token minting and secret loading, measured against the flags of both tools. The token
value never appears in argv and is never printed:

```
flyctl tokens create deploy -a danorz-com-blog-prod -x 8760h -j | jq -jr '.token' | gh secret set FLY_API_TOKEN_PROD -R orzechowskid/oneshot-blog
flyctl tokens create deploy -a danorz-com-blog-stage -x 8760h -j | jq -jr '.token' | gh secret set FLY_API_TOKEN_STAGE -R orzechowskid/oneshot-blog
sed -n 's/^export ADMIN_EMAIL=//p' admin-creds.dotenv    | tr -d '\n' | gh secret set ADMIN_EMAIL_PROD
sed -n 's/^export ADMIN_PASSWORD=//p' admin-creds.dotenv | tr -d '\n' | gh secret set ADMIN_PASSWORD_PROD
```

The stage pair is loaded from `admin-creds-stage.dotenv` into `ADMIN_EMAIL_STAGE` and
`ADMIN_PASSWORD_STAGE` in the same form. `gh secret set --env-file` is not used: it
would create secrets named `ADMIN_EMAIL` and `ADMIN_PASSWORD`, not the per-environment
names.

Branch protection, measured against gh 2.103.3:

```
git branch develop main && git push origin develop
gh repo edit orzechowskid/oneshot-blog --default-branch develop
gh api -X PUT repos/orzechowskid/oneshot-blog/branches/main/protection --input protection.json
```

Rule set: `required_status_checks` null, `enforce_admins` true,
`required_pull_request_reviews` with `required_approving_review_count` 0,
`dismiss_stale_reviews` true, `require_code_owner_reviews` false, `restrictions` null,
`required_linear_history` false, `allow_force_pushes` false, `allow_deletions` false.
Read-only proof:

```
gh api repos/orzechowskid/oneshot-blog/branches/main/protection --jq '{enforce_admins:.enforce_admins.enabled, approvals:.required_pull_request_reviews.required_approving_review_count, force_push:.allow_force_pushes.enabled, deletions:.allow_deletions.enabled}'
```

Expected output `{"enforce_admins":true,"approvals":0,"force_push":false,"deletions":false}`.

Also measured: two deploy tokens scoped to the old app `oneshot-blog` exist, found with
`flyctl tokens list --scope app -a oneshot-blog`. They are retired after destruction
with `flyctl tokens revoke <id> <id>`.

### Consequences

- Destroying the old app `oneshot-blog` releases the global hostname
  `oneshot-blog.fly.dev` to the public namespace. Old readers lose the address. This
  consequence belongs to the owner's decision to destroy both current apps (owner
  decision 1).
- The insurance snapshot of the old production database is a volume snapshot: a block
  copy of a running database, not a consistent dump. By the owner's decision the step
  is insurance, optional, and not a restore path.
- The pipeline stores the admin credential pair as app secrets on every deploy. The
  pair exists in the repository secrets and is staged and landed on the deployed app
  on every deploy, so anyone who can read the repository secrets can sign in to that
  environment.
