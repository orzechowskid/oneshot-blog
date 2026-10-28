# One Shot Blog

A small blog with a public reading view and a single-owner admin area. Posts are written in GitHub-Flavored Markdown. Uploaded images are stored in PostgreSQL and served from `/images/:id`.

The app runs on Node.js 24 and uses native TypeScript type stripping. It does not use `tsx` or `ts-node`. React Router 8 runs in framework mode with server-side rendering. Styling uses CSS Modules, not Tailwind. Shared interactive components use `react-aria-components`.

## Requirements

- Node.js 24.13 or newer
- npm 11 or newer
- Docker, for the local PostgreSQL service
- Chromium for Playwright: `npx playwright install chromium`
- `flyctl` for deployment, or a path to it in `FLYCTL_BIN`

No other global CLI tools are needed. Playwright browsers are installed through `npx`.

## Installer

`npm run setup` asks for the mode and the owner credentials, then writes `.env`.

- Choose `1` (local): writes a development `.env` with the Docker Compose database URL, port 3000, bootstrap credentials, and a generated `SEED_TOKEN`.
- Choose `2` (Fly.io): writes the settings used by `scripts/deploy.ts` and updates the `app` and `primary_region` in `fly.toml`. It can run the deploy at the end.

The installer asks only for values that have no working default: the owner email and password. Press Enter to accept each default. Leave the password blank to generate one. The owner password and Fly API token prompts do not echo typed characters. The installer writes the owner password and `SEED_TOKEN` to `.env`; it prints `SEED_TOKEN` once and does not print the owner password. An existing `.env` is copied to `.env.backup-<timestamp>` before it is replaced.

The npm scripts load `.env` with Node's `--env-file-if-exists=.env`, so the file applies to `npm run dev`, `npm start`, `npm run deploy`, and `npm run seed`.

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

To create an owner account during local development, set `BOOTSTRAP_EMAIL` and `BOOTSTRAP_PASSWORD` before starting the server. The bootstrap code creates the owner only when the `users` table is empty.

```bash
BOOTSTRAP_EMAIL=owner@example.com \
BOOTSTRAP_PASSWORD='a-long-local-password' \
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
| `npm run deploy` | Create or update the Fly.io app, database, secrets, and owner account |
| `npm run seed` | Seed the owner account on an existing deployment |
| `npm run setup` | Write a local or Fly.io `.env` interactively |
| `npm run verify` | Run typecheck, unit tests, and production build |

## Environment variables

| Variable | Used by | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | Server, scripts, deploy | PostgreSQL connection string |
| `PORT` | Server | HTTP port. Default is `3000`; Fly uses `8080` |
| `NODE_ENV` | Server, auth | `production` enables production behavior |
| `COOKIE_SECURE` | Auth | `true` or `false`; production defaults to `true` |
| `BOOTSTRAP_EMAIL` | Server | Owner email created when the users table is empty |
| `BOOTSTRAP_PASSWORD` | Server | Owner password for bootstrap |
| `SEED_TOKEN` | Seed route, deploy, seed script | Shared secret for `POST /internal/seed` |
| `APP_URL` | Seed script | Base URL of the deployed app |
| `OWNER_EMAIL` | Deploy, seed | Owner email |
| `OWNER_PASSWORD` | Deploy, seed | Owner password. Deploy generates one if absent |
| `FLY_APP` | Deploy | Fly app name. Default is `oneshot-blog` |
| `FLY_REGION` | Deploy | Fly region for the Postgres app. Default is `iad` |
| `FLY_ORG` | Deploy | Optional Fly organization |
| `FLY_POSTGRES_APP` | Deploy | Fly Postgres app name. Default is `<FLY_APP>-db` |
| `FLY_API_TOKEN` | Deploy | Fly API token for unattended deploys |
| `FLYCTL_BIN` | Deploy | Path to the `flyctl` binary |
| `DATABASE_SSL` | Server | Set to `true` for PostgreSQL connections that need SSL |

## Deployment to Fly.io

The deploy script is unattended. It:

1. Creates the Fly app if it does not exist.
2. Creates a Fly Postgres app if `DATABASE_URL` is not supplied.
3. Attaches the Postgres database to the app.
4. Sets `SEED_TOKEN` and, when supplied, `DATABASE_URL`.
5. Deploys the Docker image with a remote builder.
6. Waits for `https://<app>.fly.dev/health`.
7. Seeds the owner account through `POST /internal/seed`.
8. Prints the owner email and a generated password when no password was supplied.

Run it with a Fly token:

```bash
FLY_API_TOKEN=... npm run deploy
```

Set the owner explicitly:

```bash
FLY_API_TOKEN=... \
OWNER_EMAIL=owner@example.com \
OWNER_PASSWORD='a-long-owner-password' \
npm run deploy
```

The deploy script uses `flyctl` because Fly.io does not expose a single npm-only deployment path. Set `FLYCTL_BIN` to a local binary if `flyctl` is not on `PATH`. The running application itself does not need `flyctl` or any global tool.

`fly.toml` sets the internal port to `8080`. The Dockerfile builds with Node 24, runs `npm ci`, builds the app, removes development dependencies, and starts `node server.ts`.

## GitHub Actions deployment

`.github/workflows/deploy.yml` deploys when a pull request is merged into `main`. It checks out the merge commit and runs `flyctl deploy --remote-only --yes`. It uses `pull_request_target` so the Fly secret is available for pull requests from forks; it checks out the merged commit, not the pull request head.

The workflow needs one secret in the GitHub repository:

- `FLY_API_TOKEN`: a Fly deploy token limited to this app.

Create the app and database once before the first action run, for example with `npm run setup` and mode `2`. Then create a deploy token:

```bash
flyctl tokens create deploy -a oneshot-blog -x 8760h
```

Copy the token into GitHub: repository Settings → Secrets and variables → Actions → New repository secret. Use the name `FLY_API_TOKEN`.

No GitHub token is needed for the workflow. GitHub Actions supplies an ephemeral `GITHUB_TOKEN`, but this workflow does not use it. Pushing the repository to GitHub needs your normal GitHub authentication (SSH key, browser login, or a personal access token).

The workflow deploys the existing Fly app. It does not create the app, database, or owner account. Run `npm run deploy` once locally to provision those, or run `npm run setup` and choose Fly.io. If the app name is not `oneshot-blog`, update `app` in `fly.toml` and pass the same name to `flyctl tokens create deploy -a`.

## Tests

### Unit tests

Vitest covers pure functions: slugs, excerpts, image validation, password hashing, cookies, redirect safety, formatting, validation, and Markdown rendering.

```bash
npm test
```

### Integration tests

Playwright starts a production server, resets the database, and waits for `/health`. The tests cover the empty home page, login, post creation, image upload, Markdown image rendering, invalid login, WCAG checks, seed endpoint behavior, home page listing, post deletion, and logout.

```bash
npm run db:up
npx playwright install chromium
npm run test:integration
```

The Playwright config resets the database before each run. It uses `BOOTSTRAP_EMAIL` and `BOOTSTRAP_PASSWORD`, with defaults for the test owner.

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
- The seed endpoint requires `SEED_TOKEN` and refuses to create a second owner.
