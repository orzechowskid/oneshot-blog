## Why

On 4 November 2026, `npm run deploy` pushed the laptop's local development
database address into the deployed app's secrets. That took the production
site down: `/` and `/login` returned 500 while `/health` stayed 200. The
data was unharmed: 1 user row, 0 posts. The same script generated and
printed a seed token and overwrote the deployed seed token with the local
one. That token now unlocks nothing: measured on the live app, `POST
/internal/seed` returns 409 with the correct token and 403 with a wrong
token once one user row exists. The seed route can no longer change
anything; it and the deploy-side secret handling are dead weight, and the
deploy script's local-to-deployed copy of the database address is a live
production risk.

## What Changes

- **BREAKING** Remove the `POST /internal/seed` route and its registration
  in `app/routes.ts`.
- Delete `scripts/seed.ts` and the npm script named `seed`.
- Remove the deploy script's seeding step, its seed token handling, its
  random token generation, and the line that prints the token.
- Remove the seed token from the installer's generated `.env` and from
  `.env.example`.
- Make the deploy script stop writing a `DATABASE_URL` secret for a
  deployed app, and choose the `fly postgres attach` step from the
  deployed app's own secret names.
- Remove the two seed-endpoint tests from `tests/integration/blog.spec.ts`
  and the seed token entry from `playwright.config.ts`.
- Update `README.md` to match.

Not in this change: the admin credential pair and the `owner:reset`
command stay as they are; the production seed-token secret cleanup is an
operator action after this lands; the production admin credential reset is
a separate later step; local development keeps its `DATABASE_URL` in
`.env`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `admin-credentials`: the requirement "Seed route refuses when any user
  exists" is removed with the route, and the requirement "Deployed
  machines can run the reset command" changes so the deploy script stores
  neither `SEED_TOKEN` nor `DATABASE_URL` as a deployed secret and
  chooses the `fly postgres attach` step from the deployed app's secret
  names.

## Impact

- App code: `app/routes/seed.tsx` (deleted), `app/routes.ts` (route
  registration removed).
- Scripts: `scripts/seed.ts` (deleted), `scripts/deploy.ts` (no seeding
  step, no seed token handling, no random token generation or printing,
  no `DATABASE_URL` secret; the attach step is chosen from the deployed
  app's secret names), `scripts/install.ts` (the generated `.env` no
  longer contains a seed token; the local development `DATABASE_URL`
  stays).
- Manifest and examples: `package.json` (the `seed` script removed),
  `.env.example` (seed token entry removed).
- Tests: `tests/integration/blog.spec.ts` (the two seed-endpoint tests
  removed), `playwright.config.ts` (seed token entry removed),
  `tests/unit/` (new deploy script unit tests for the secret list, the
  attach decision, and the absence of a seeding step).
- Docs: `README.md` (the seed rows, the seed script row, the seed token
  row and the seed security bullet removed; the deploy description states
  the attach rule).
- Spec: the `admin-credentials` capability (see Modified Capabilities).
- Deployment behaviour: deploys no longer touch the deployed app's
  `DATABASE_URL` secret; `fly postgres attach` is the only mechanism for
  it.
