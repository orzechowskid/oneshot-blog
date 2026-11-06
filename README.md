# Blog

A small blog with a public reading view and a single-owner admin area. Posts are written in GitHub-Flavored Markdown. Uploaded images are stored in PostgreSQL.

The app runs on Node.js 24 and uses TypeScript. React Router 8 runs in framework mode with server-side rendering. Styling uses CSS Modules. Shared interactive components use `react-aria-components`.

## Requirements

- Node.js 24.13 or newer
- npm 11 or newer
- Docker, for the local PostgreSQL service
- Chromium for Playwright: `npx playwright install chromium`
- `flyctl` for the operator runbook steps; the pipelines install their own

## Installer

`npm run setup` asks for the owner email, the owner password, and the database URL, then writes a development `.env` with the Docker Compose database URL, port 3000, and the `ADMIN_EMAIL` and `ADMIN_PASSWORD` pair.

The installer asks for the owner email and password. The email has no default and must be a valid address. The address you type there is a local development address and not the production admin address, because the installer generates the credential pair only for the local database. Leave the password blank to generate one. The owner password prompt does not echo typed characters. The installer writes the owner password to `.env`; it does not print the secret. An existing `.env` is copied to `.env.backup-<timestamp>` before it is replaced.

The npm scripts load `.env` with Node's `--env-file-if-exists=.env`, so the file applies to `npm run dev` and `npm start`.

```bash
npm install
npm run setup
npm run db:up
npm run dev
```

## Local setup

```bash
npm install
npm run db:up
DATABASE_URL=postgres://blog:blog@127.0.0.1:5432/blog node scripts/reset-db.ts
```

Start the development server:

```bash
npm run dev
```

Open `http://127.0.0.1:3000`. The dev script watches only `server.ts`. Vite handles changes to app modules.

The schema is applied automatically at startup. The first request creates the tables if they do not exist.

To create the admin account during local development, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before starting the server. The server creates the account only when the `users` table is empty.

```bash
ADMIN_EMAIL=admin@example.com \
ADMIN_PASSWORD='a-long-local-password' \
npm run dev
```

## Production build and start

```bash
npm run build
npm start
```

`npm start` sets `NODE_ENV=production`. The server serves `build/client` and imports `build/server/index.js`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server and SSR handler |
| `npm run build` | Build the client and server bundles |
| `npm start` | Run the production server |
| `npm run typecheck` | Run TypeScript without emitting files |
| `npm test` | Run Vitest unit tests |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run db:up` | Start PostgreSQL with Docker Compose |
| `npm run db:down` | Stop PostgreSQL and remove its volume |
| `npm run test:integration` | Run Playwright user-journey tests against a reset database |
| `npm run storybook` | Start Storybook on port 6006 |
| `npm run build-storybook` | Build a static Storybook |
| `npm run test:storybook` | Build Storybook and run visual and accessibility tests |
| `npm run test:storybook:update` | Regenerate visual snapshots |
| `npm run owner:reset` | Reset the admin email and password in the database |
| `npm run setup` | Write a local `.env` interactively |
| `npm run verify` | Run typecheck, unit tests, and production build |

## Environment variables

| Variable | Used by | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | Server, scripts, reset | PostgreSQL connection string |
| `PORT` | Server | HTTP port. Default is `3000`; Fly uses `8080` |
| `NODE_ENV` | Server, auth | `production` enables production behavior |
| `COOKIE_SECURE` | Auth | `true` or `false`; production defaults to `true` |
| `ADMIN_EMAIL` | Server, deploy engine, reset | Admin email. The server creates the admin account from it when the users table is empty |
| `ADMIN_PASSWORD` | Server, deploy engine, reset | Admin password. The deploy engine refuses to run when it is absent |
| `FLY_API_TOKEN` | Deploy engine | Fly API token. The pipeline supplies it from a per-environment repository secret |
| `FLYCTL_BIN` | Deploy engine | Path to the `flyctl` binary. The pipeline installs `flyctl`, so the default is used |
| `DATABASE_SSL` | Server, reset | Set to `true` for PostgreSQL connections that need SSL |

## Deployment to Fly.io

There are two environments, each with its own Fly app, its own Postgres app, its own public address, its own admin credential pair, and its own app-scoped token:

| Environment | Fly app | Address | Configuration file |
| --- | --- | --- | --- |
| `prod` | `danorz-com-blog-prod` | `https://danorz-com-blog-prod.fly.dev` | `fly.prod.toml` |
| `stage` | `danorz-com-blog-stage` | `https://danorz-com-blog-stage.fly.dev` | `fly.stage.toml` |

The repository holds exactly these two Fly configuration files and no default file. Each file sets the internal port to `8080`. The Dockerfile builds with Node 24, runs `npm ci`, builds the app, removes development dependencies, and starts `node server.ts`.

No local command performs a deploy; the deploy engine `scripts/deploy.ts` is run only by the two pipelines, and it refuses to run without an environment name of `prod` or `stage`.

Each pipeline runs the engine for its environment:

- Production: `node scripts/deploy.ts prod --config fly.prod.toml`
- Pre-production: `node scripts/deploy.ts stage --config fly.stage.toml`

For each deploy the engine:

1. Probes the app with `flyctl status --app <app> --json` and creates the app only when the probe says it is missing.
2. Reads the deployed secret names. Only when `DATABASE_URL` is absent does it create the Postgres app (if missing) and attach it; when the secret is present the deploy changes nothing about the database.
3. Stores `ADMIN_EMAIL` and `ADMIN_PASSWORD` as staged Fly secrets, so the admin pair is stored as app secrets on every deploy. After the deploy, `flyctl secrets list --app <app>` shows the pair alongside `DATABASE_URL`. Before this step it prints a line naming the app and the email whose credential pair is stored.
4. Deploys the Docker image with a remote builder.
5. Waits for the environment's `https://<app>.fly.dev/health`.

The engine never prints a credential value or a token value, and it never writes a `DATABASE_URL` secret; the attach step is the only mechanism that sets the deployed database address. When the attach step runs, the generated database role password is not shown because the engine captures command output; to see and store that password, run the attach command by hand, as the operator runbook below does.

## GitHub Actions deployment

`.github/workflows/deploy-prod.yml` deploys production when a pull request is merged into `main`. `.github/workflows/deploy-stage.yml` deploys pre-production when a pull request is merged into `develop`. A direct push to either branch does not deploy; only a merge through a closed pull request does.

A pipeline runs when a commit is pushed to its branch, using the workflow file in that commit. Direct pushes to main are blocked by branch protection, so every push to main is a merge and every push to main deploys production; pushes to develop, direct pushes and merges alike, deploy pre-production. Each pipeline installs dependencies with `npm ci`, so a lock file out of sync with `package.json` fails the pipeline before any deploy step.

GitHub blocks the `pull_request_target` event in public repositories by default on 2 December 2026, with enforcement test windows on 9 and 16 November 2026, so both pipelines trigger on a push to their branch and use no pull request event. A push to main deploys production, and a push to develop deploys pre-production.

Both pipelines use `pull_request_target` so pull requests from forks can deploy, and they check out the merged commit, not the pull request head, so fork code never runs in the deploy step. Each pipeline runs `npm run typecheck` and `npm test` before the deploy step, and when either fails the pipeline stops. The stage pipeline additionally runs the Playwright browser suite against its own Postgres service container; the production pipeline has no browser suite.

Each pipeline reads three repository secrets and maps them onto the variables the engine reads:

| Pipeline | Token secret | Credential secrets |
| --- | --- | --- |
| `deploy-prod.yml` | `FLY_API_TOKEN_PROD` | `ADMIN_EMAIL_PROD`, `ADMIN_PASSWORD_PROD` |
| `deploy-stage.yml` | `FLY_API_TOKEN_STAGE` | `ADMIN_EMAIL_STAGE`, `ADMIN_PASSWORD_STAGE` |

The tokens are app-scoped: `FLY_API_TOKEN_PROD` is limited to `danorz-com-blog-prod`, and `FLY_API_TOKEN_STAGE` is limited to `danorz-com-blog-stage`. Because the engine stores the admin pair as app secrets on every deploy, the pair also exists in the matching repository secrets; anyone who can read repository secrets can sign in to that environment. Rotate the pair by deploying with the new pair, running the credential reset in the environment's machine, and only then retiring the old pair.

The pipelines use no GitHub token of their own. GitHub Actions supplies an ephemeral `GITHUB_TOKEN`, but neither pipeline uses it.

### Operator runbook

The Migration Plan in `openspec/changes/fly-dual-environment-deploys/design.md` is the full runbook: it is numbered, in order, and every step states its rollback. The operator runs the flyctl steps with an account-level token. The steps that change the deployed world:

First creation, production (the pre-production app and database are created the same way with the `danorz-com-blog-stage` and `danorz-com-blog-stage-db` names):

```bash
fly apps create danorz-com-blog-prod
fly postgres create --name danorz-com-blog-prod-db --region iad --vm-size shared-cpu-1x --volume-size 1 --initial-cluster-size 1
```

Attach by hand, so the generated database role password is visible; record it. The attach command takes no confirmation flag:

```bash
fly postgres attach danorz-com-blog-prod-db --app danorz-com-blog-prod
```

Mint the app-scoped token and set it as the repository secret, the value piped so it is never printed:

```bash
flyctl tokens create deploy -a danorz-com-blog-prod -x 8760h -j | jq -jr '.token' | gh secret set FLY_API_TOKEN_PROD -R orzechowskid/oneshot-blog
```

The stage token is minted the same way into `FLY_API_TOKEN_STAGE`. The per-environment credential secrets are set from the matching credential file the same way, piped so the values are never printed.

Snapshot the old database (insurance, optional; a volume snapshot of a running database is a block copy, not a consistent dump):

```bash
flyctl volume list --app oneshot-blog-db
flyctl volume snapshots create <volume-id> --app oneshot-blog-db
flyctl volume snapshots list <volume-id> --app oneshot-blog-db
```

Destroy the old app and the old database app (irreversible; only after both sign-in proofs passed):

```bash
fly apps destroy oneshot-blog-db --yes
fly apps destroy oneshot-blog --yes
```

Apply branch protection on `main`: pull request required, no direct push, no force push, and required approving review count 0. The count is 0, not 1: the repository has one author, and GitHub does not let an author approve their own pull request, so a required review of one would make the production deploy permanently unreachable. Write `protection.json`:

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

and apply it:

```bash
gh api -X PUT repos/orzechowskid/oneshot-blog/branches/main/protection --input protection.json
```

Read-only proof:

```bash
gh api repos/orzechowskid/oneshot-blog/branches/main/protection --jq '{enforce_admins:.enforce_admins.enabled, approvals:.required_pull_request_reviews.required_approving_review_count, force_push:.allow_force_pushes.enabled, deletions:.allow_deletions.enabled}'
```

Expected output: `{"enforce_admins":true,"approvals":0,"force_push":false,"deletions":false}`.

## Admin credential reset

`npm run owner:reset` resets the admin credential in the database. It reads `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `DATABASE_URL` from the environment only. The password is never taken from arguments, so it never appears in shell history or the process list. It must be 12 to 200 characters.

The command works on the `users` table in one transaction:

- `users` has zero rows: it inserts the admin account.
- `users` has one row: it updates that row's email and password hash.
- `users` has more than one row: it prints an error naming the row count, changes nothing, and exits 1.

Existing sessions are untouched: a reset changes the credential, it does not log anyone out. The command prints the resulting email and never prints the password.

Local form, reading the pair and `DATABASE_URL` from `.env`:

```bash
npm run owner:reset
```

Production form, run inside the Fly machine:

```bash
fly ssh console -a danorz-com-blog-prod -C "sh -c 'cd /app && node scripts/owner-reset.ts'"
```

Pre-production form:

```bash
fly ssh console -a danorz-com-blog-stage -C "sh -c 'cd /app && node scripts/owner-reset.ts'"
```

The command reads only environment variables. The command runs as the user the ssh console gives you. The console shell does not automatically inherit the app's Fly secrets, so the operator must supply the admin pair in that command's environment. Both the working directory and the secret inheritance are to be confirmed the first time the command is run against the live app.

To rotate a credential pair, keep the current one reachable until the new one works: deploy with the new pair, run the reset command in the environment's machine, sign in with the new credential, and only then retire the saved copy. An early delete is unrecoverable: no in-app path shows a password.

## Tests

### Unit tests

Vitest covers pure functions: slugs, excerpts, image validation, password hashing, cookies, redirect safety, formatting, validation, and Markdown rendering. It also covers the deploy script's secret list and attach decision, and the admin credential reset script's password hashing.

```bash
npm test
```

### Integration tests

Playwright starts a production server, resets the database, and waits for `/health`. The tests cover the empty home page, login, post creation, image upload, Markdown image rendering, invalid login, WCAG checks, home page listing, post deletion, and logout.

```bash
npm run db:up
npx playwright install chromium
npm run test:integration
```

The Playwright config resets the database before each run. It passes `ADMIN_EMAIL` and `ADMIN_PASSWORD` to the server, with a fixed test account as the default.

### Storybook tests

Storybook stories cover the shared components. Playwright runs visual regression and axe accessibility checks against the static Storybook build.

```bash
npm run test:storybook
```

Visual snapshots are stored under `tests/storybook/visual.spec.ts-snapshots`. They are Linux-specific. Regenerate them after intentional visual changes or when running on a different platform:

```bash
npm run test:storybook:update
```

## Accessibility

The app targets WCAG 2.1 Level AA. It includes:

- A skip link to the main content.
- Visible keyboard focus styles.
- Labels and descriptions for form fields.
- An error summary with `role="alert"` and field-level error messages.
- Table captions and column headers.
- Alt text for every uploaded image.
- Reduced-motion support.
- High-contrast color tokens.
- Accessible shared controls from `react-aria-components`.

The Playwright integration suite runs axe against the public and admin pages. The Storybook suite runs axe against each component story.

## Data model

`db/schema.sql` defines four tables:

- `users`: one owner account, with a scrypt password hash.
- `posts`: slug, title, Markdown body, excerpt, status, and timestamps.
- `images`: post attachment, MIME type, byte size, alt text, and `bytea` data.
- `sessions`: SHA-256 token hash, user, and expiry.

Images are limited to 5 MB and to PNG, JPEG, WebP, or GIF. The server detects the image type from magic bytes and sanitizes the filename. Image responses use immutable cache headers.

## Security notes

- Session cookies are `HttpOnly`, `SameSite=Lax`, and secure in production.
- Session tokens are stored as SHA-256 hashes, not plaintext.
- Passwords use Node's `scrypt`.
- State-changing actions check the request origin.
- Redirects are limited to same-origin paths.
- Markdown is rendered with GitHub-Flavored Markdown and sanitized with `sanitize-html`.
