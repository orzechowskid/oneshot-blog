# Verification: fly-dual-environment-deploys

Date: 2026-11-05 07:53 UTC

All commands were run from the repository root `/home/dan/repos/oneshot-blog`.
Results are measured, not estimated. Outputs are pasted exactly as printed;
exit status is recorded for every step.

## Step 1: npm run verify

Command: `npm run verify`

Exit status: 0

Output:

```
> oneshot-blog@1.0.0 verify
> npm run typecheck && npm run test && npm run build


> oneshot-blog@1.0.0 typecheck
> tsc --noEmit


> oneshot-blog@1.0.0 test
> vitest run


 RUN  v5.0.5 /home/dan/repos/oneshot-blog


 Test Files  12 passed (12)
      Tests  119 passed (119)
   Start at  02:51:39
   Duration  747ms (tests 46%, import 41%, transform 9%, worker 4%)


> oneshot-blog@1.0.0 build
> react-router build

Using Vite Environment API
vite v8.3.5 building client environment for production...
transforming...
✓ 1524 modules transformed.
rendering chunks...
computing gzip size...
build/client/.vite/manifest.json                    7.15 kB │ gzip:  1.01 kB
build/client/assets/not-found-vXx937bj.css          0.03 kB │ gzip:  0.05 kB
build/client/assets/login-BcuhfNLr.css              0.18 kB │ gzip:  0.15 kB
build/client/assets/home-FjHVu9GG.css               0.71 kB │ gzip:  0.33 kB
build/client/assets/admin-D43YD4w7.css              0.91 kB │ gzip:  0.40 kB
build/client/assets/TextField-DGbxAf18.css          0.91 kB │ gzip:  0.40 kB
build/client/assets/Button-CqujLZE6.css             0.93 kB │ gzip:  0.37 kB
build/client/assets/post-CB-7_plc.css               1.61 kB │ gzip:  0.54 kB
build/client/assets/root-_Kr5PGuv.css               2.47 kB │ gzip:  1.06 kB
build/client/assets/editor-B4ezHe4W.css             5.45 kB │ gzip:  1.40 kB
build/client/assets/admin-autosave-BvRk9kiK.js      0.00 kB │ gzip:  0.02 kB
build/client/assets/admin-preview-BvRk9kiK.js       0.00 kB │ gzip:  0.02 kB
build/client/assets/health-BvRk9kiK.js              0.00 kB │ gzip:  0.02 kB
build/client/assets/image-BvRk9kiK.js               0.00 kB │ gzip:  0.02 kB
build/client/assets/logout-BvRk9kiK.js              0.00 kB │ gzip:  0.02 kB
build/client/assets/admin.module-B6DnHMn1.js        0.22 kB │ gzip:  0.15 kB
build/client/assets/format-CVdu1TH9.js              0.31 kB │ gzip:  0.21 kB
build/client/assets/not-found-DNRr1-ew.js           0.45 kB │ gzip:  0.30 kB
build/client/assets/admin-new-sOMYA7wd.js           0.48 kB │ gzip:  0.33 kB
build/client/assets/admin-layout-D_Z2ojRo.js        0.64 kB │ gzip:  0.36 kB
build/client/assets/TextField.module-CTuCHoOc.js    0.70 kB │ gzip:  0.44 kB
build/client/assets/post-DjMc6JRS.js                1.01 kB │ gzip:  0.55 kB
build/client/assets/home-DTcwRLRM.js                1.28 kB │ gzip:  0.60 kB
build/client/assets/Link-Dw_60FpQ.js                1.46 kB │ gzip:  0.74 kB
build/client/assets/admin-index-C-wNyZGG.js         1.57 kB │ gzip:  0.65 kB
build/client/assets/root-DCT53zTF.js                2.26 kB │ gzip:  0.94 kB
build/client/assets/react-dom-CEExdrTL.js           3.86 kB │ gzip:  1.40 kB
build/client/assets/Button-BhOSD-si.js              5.41 kB │ gzip:  2.21 kB
build/client/assets/editor.module-C06y9vAe.js       9.44 kB │ gzip:  3.37 kB
build/client/assets/lib-x1N1qmCg.js                 9.94 kB │ gzip:  3.97 kB
build/client/assets/login-De4qSDfl.js              11.37 kB │ gzip:  4.04 kB
build/client/assets/useHover-BAw7s3O5.js           33.97 kB │ gzip: 11.55 kB
build/client/assets/admin-edit-BKg3uJuO.js         50.00 kB │ gzip: 15.13 kB
build/client/assets/jsx-runtime-BV8UiYbH.js       122.59 kB │ gzip: 40.11 kB
build/client/assets/entry.client-CPulBi7H.js      219.29 kB │ gzip: 68.89 kB

✓ built in 930ms
vite v8.3.5 building ssr environment for production...
transforming...
✓ 53 modules transformed.
rendering chunks...

✓ 1 asset cleaned from React Router server build.
build/server/assets/server-build-CO8-HHUr.css

computing gzip size...
build/server/.vite/manifest.json                0.22 kB │ gzip:  0.15 kB
build/server/assets/server-build-CO8-HHUr.css  13.23 kB │ gzip:  3.05 kB
build/server/index.js                          93.42 kB │ gzip: 20.04 kB

✓ built in 122ms
```

Typecheck (`tsc --noEmit`) printed no errors. Vitest counts: 12 test files passed (12), 119 tests passed (119), 0 failed. Build result: `react-router build` completed, client build "✓ built in 930ms" (1524 modules), server build "✓ built in 122ms" (53 modules).

## Step 2: npx vitest run tests/unit/deploy.test.ts

Command: `npx vitest run tests/unit/deploy.test.ts`

Exit status: 0

Output:

```
RUN  v5.0.5 /home/dan/repos/oneshot-blog


 Test Files  1 passed (1)
      Tests  8 passed (8)
   Start at  02:51:46
   Duration  90ms (import 41%, transform 27%, tests 18%, worker 14%, environment 1%)
```

## Step 3: npx playwright test --list

Command: `npx playwright test --list`

Exit status: 0

Output:

```
Listing tests:
  adminlist.spec.ts:85:1 › a published post with an attached draft is listed as published with a draft attached and the time cell shows the draft save time
  adminlist.spec.ts:128:1 › a draft-only post is listed as a draft and the time cell shows its last save time
  adminlist.spec.ts:168:1 › a published post without a draft is listed as published and the time cell shows the last publication time
  adminlist.spec.ts:199:1 › the time column header reads Last change
  adminlist.spec.ts:217:1 › the View control appears only on published rows
  adminlist.spec.ts:264:1 › saving a draft on a draft-only post moves its row to the position ordered by its new last change time
  autosave.spec.ts:37:1 › idle autosave on a new post creates one draft-only post, and later idle and explicit saves update the same post
  autosave.spec.ts:82:1 › the editor shows saving while a save is in flight, saved after it succeeds, and unsaved after a further change, with the submit controls disabled in flight
  autosave.spec.ts:119:1 › an autosave with an expired session shows the failed-to-save state and keeps the typed text
  autosave.spec.ts:142:1 › an autosave rejected by validation answers with the field messages and the editor shows them and keeps the typed text
  autosave.spec.ts:203:1 › reloading with unsaved edits warns, and dismissing keeps the typed text while accepting reloads the editor to the stored content
  autosave.spec.ts:265:1 › an explicit draft save on a new post that cannot obtain a free address is rejected with an address error and no server error
  autosave.spec.ts:345:1 › autosave does not start a second save while the first is in flight
  blog.spec.ts:34:1 › home page shows the empty state before any posts exist
  blog.spec.ts:64:1 › the owner can log in and create a published post
  blog.spec.ts:90:1 › the owner can save a draft and see it as a draft in the admin list
  blog.spec.ts:116:1 › the owner can upload an image and use it in a post
  blog.spec.ts:164:1 › invalid login shows an accessible error
  blog.spec.ts:176:1 › pages meet WCAG 2.1 AA automated checks
  blog.spec.ts:185:1 › the home page lists the published post
  blog.spec.ts:192:1 › the owner can delete a post
  blog.spec.ts:207:1 › the owner can log out
  blog.spec.ts:220:1 › the site header shows New post when logged in and hides it when logged out
  draft-editing.spec.ts:39:1 › saving a draft on a published post leaves the public page showing the published title, body, and excerpt while the editor shows the draft
  draft-editing.spec.ts:86:1 › the address control is read-only on a published post
  draft-editing.spec.ts:101:1 › a submitted address value on a published post is ignored and the stored address is kept
  draft-editing.spec.ts:145:1 › an empty body cannot be published and the stored draft survives
  draft-editing.spec.ts:183:1 › a publish rejected by a length limit keeps the draft
  draft-editing.spec.ts:212:1 › a second draft save overwrites the first and the editor shows one saved state
  draft-editing.spec.ts:238:1 › Discard draft on a published post clears the draft and the public post stays live
  draft-editing.spec.ts:280:1 › the narrow-screen toggle switches between editing and previewing and keeps the typed body text
  draft-editing.spec.ts:302:1 › a draft save whose address is taken appends a numeric suffix, saves, and the editor shows the resulting address
  draft-editing.spec.ts:333:1 › a draft save with no title is rejected with a title error and no address error
  draft-editing.spec.ts:357:1 › the preview shows the saved published content when the editor opens, before any preview request
  draft-editing.spec.ts:384:1 › the toolbar buttons and keyboard shortcuts wrap the selected text in the body
  draft-editing.spec.ts:453:1 › in-app navigation with unsaved edits does not warn and the unsaved edits are dropped
  draft-editing.spec.ts:484:1 › a draft-only post keeps its address when a later draft saves with the same address and gets a numeric suffix
  draft-editing.spec.ts:518:1 › the draft-only editor shows no discard action and keeps the whole-post delete
  draft-editing.spec.ts:539:1 › uploading an image keeps the text typed after the last autosave
  publish.spec.ts:111:1 › First publication
  publish.spec.ts:153:1 › Publishing a draft-only post publishes the stored values
  publish.spec.ts:200:1 › Publish writes the validated content in the same request
  publish.spec.ts:242:1 › Republishing a published post with a draft
  publish.spec.ts:309:1 › Saving a draft on a published post
  publish.spec.ts:396:1 › Publish is unavailable on a published post with no attached draft
  publish.spec.ts:451:1 › A reader sees published content, not the attached draft
  publish.spec.ts:520:1 › An address belonging to an unpublished draft is not found
  publish.spec.ts:545:1 › The admin editor shows no control that unpublishes a published post
  publish.spec.ts:575:1 › A publish rejected by a draft discarded in another tab keeps the editor and the typed text
  publish.spec.ts:658:1 › Publish keeps the body it validated when a draft save lands in the same window
Total: 50 tests in 5 files
```

Per-file counts: `adminlist.spec.ts` 6, `autosave.spec.ts` 7, `blog.spec.ts` 10, `draft-editing.spec.ts` 16, `publish.spec.ts` 11. Total line: `Total: 50 tests in 5 files`.

## Step 4: ls fly*.toml

Command: `ls fly*.toml`

Exit status: 0

Output:

```
fly.prod.toml
fly.stage.toml
```

## Step 5: ls .github/workflows

Command: `ls .github/workflows`

Exit status: 0

Output:

```
deploy-prod.yml
deploy-stage.yml
```

## Step 6: grep for a deploy npm script in package.json

Command: `grep -n '"deploy"' package.json`

Exit status: 1 (no match, as expected)

Output: (none)

## Step 7: grep for stage secret names in the prod workflow

Command: `grep -nE 'FLY_API_TOKEN_STAGE|ADMIN_EMAIL_STAGE|ADMIN_PASSWORD_STAGE' .github/workflows/deploy-prod.yml`

Exit status: 1 (no match, as expected)

Output: (none)

## Step 8: grep for prod secret names in the stage workflow

Command: `grep -nE 'FLY_API_TOKEN_PROD|ADMIN_PASSWORD_PROD|ADMIN_EMAIL_PROD' .github/workflows/deploy-stage.yml`

Exit status: 1 (no match, as expected)

Output: (none)

## Step 9: grep for FLY_ in .env.example

Command: `grep -n 'FLY_' .env.example`

Exit status: 1 (no match, as expected)

Output: (none)

## Step 10: grep for legacy fly.toml or npm run deploy in README.md

Command: `grep -nE 'fly\.toml|npm run deploy' README.md`

Exit status: 1 (no match, as expected)

Output: (none)

## Step 11: grep for --yes in scripts/deploy.ts

Command: `grep -n '"--yes"' scripts/deploy.ts`

Exit status: 0

Output:

```
154:  fly(["apps", "create", row.app, "--yes"]);
381:    "--yes",
```

Exactly two lines: line 154 is the `fly apps create <app> --yes` call, line 381 is inside the `fly deploy . --app <app> --config <file> --remote-only --yes` call.

## Step 12: grep for exported functions in scripts/deploy.ts

Command: `grep -n 'export function' scripts/deploy.ts`

Exit status: 0

Output:

```
37:export function resolveEnvironment(name: string): EnvironmentRow | undefined {
73:export function shouldAttachPostgres(deployedSecretNames: string[]): boolean {
77:export function buildDeploySecrets(
```

Exactly three exported functions.

## Step 13: import the deploy module without side effects

Command:

```
env -u ADMIN_EMAIL -u ADMIN_PASSWORD -u FLY_API_TOKEN -u DATABASE_URL node --input-type=module -e 'const m = await import("file://" + process.cwd() + "/scripts/deploy.ts"); console.log(Object.keys(m).sort().join(", "))'
```

Exit status: 0

Output:

```
buildDeploySecrets, resolveEnvironment, shouldAttachPostgres
```

No flyctl output. Importing the module runs no deploy.

## Step 14: run the deploy script with no arguments

Command: `env -u ADMIN_EMAIL -u ADMIN_PASSWORD -u FLY_API_TOKEN -u DATABASE_URL node scripts/deploy.ts`

Exit status: 1

Output:

```
The first argument must be an environment name. Accepted names: prod, stage. No app was created and no secret was written.
```

The two accepted environment names (`prod`, `stage`) are printed. No deploy tool output.

## Step 15: run the deploy script with an unknown argument

Command: `env -u ADMIN_EMAIL -u ADMIN_PASSWORD -u FLY_API_TOKEN -u DATABASE_URL node scripts/deploy.ts bogus`

Exit status: 1

Output:

```
The first argument must be an environment name. Accepted names: prod, stage. No app was created and no secret was written.
```

The two accepted names (`prod`, `stage`) are printed. No deploy tool output.

## Step 16: run the deploy script with a mismatched config file

Command: `env -u ADMIN_EMAIL -u ADMIN_PASSWORD -u FLY_API_TOKEN -u DATABASE_URL node scripts/deploy.ts prod --config fly.stage.toml`

Exit status: 1

Output:

```
Missing required environment variables: FLY_API_TOKEN, ADMIN_EMAIL, ADMIN_PASSWORD.
The admin credential pair is ADMIN_EMAIL and ADMIN_PASSWORD; missing from the pair: ADMIN_EMAIL, ADMIN_PASSWORD.
Set the missing variables in the environment, then run the deploy again.
```

**Did not match expectation.** The step expected the output to name the expected configuration file (`fly.prod.toml`). The output instead is the credential refusal: in `main()` in `scripts/deploy.ts`, the missing-variable check runs before the `--config` checks, so with the environment scrubbed the credential refusal fires first and the config-mismatch message (`The --config value fly.stage.toml does not match the prod environment. Expected fly.prod.toml.`) is never reached. No deploy tool output was printed and no app was created.

## Step 17: run the deploy script for prod without credentials

Command: `env -u ADMIN_EMAIL -u ADMIN_PASSWORD -u FLY_API_TOKEN -u DATABASE_URL node scripts/deploy.ts prod`

Exit status: 1

Output:

```
Missing required environment variables: FLY_API_TOKEN, ADMIN_EMAIL, ADMIN_PASSWORD.
The admin credential pair is ADMIN_EMAIL and ADMIN_PASSWORD; missing from the pair: ADMIN_EMAIL, ADMIN_PASSWORD.
Set the missing variables in the environment, then run the deploy again.
```

The refusal names both `ADMIN_EMAIL` and `ADMIN_PASSWORD` and lists all three missing variables. No deploy tool output.

## Step 18: git check-ignore for both credential files

Commands: `git check-ignore -q admin-creds.dotenv && echo ignored` and `git check-ignore -q admin-creds-stage.dotenv && echo ignored`

Exit status: 0 for both commands.

Output:

```
ignored
ignored
```

Both files are git-ignored.

## Step 19: grep for admin-creds in .dockerignore

Command: `grep -nE 'admin-creds' .dockerignore`

Exit status: 0

Output:

```
15:admin-creds.dotenv
16:admin-creds-stage.dotenv
```

Both credential files are excluded from the Docker build context.

## Step 20: grep for fixture email in tests/unit/deploy.test.ts

Commands: `grep -n 'deploy-test@example.com' tests/unit/deploy.test.ts` and `grep -n 'owner@example.com' tests/unit/deploy.test.ts`

Exit status: 0 for the first command, 1 for the second.

Output of the first command:

```
19:const FIXTURE_EMAIL = "deploy-test@example.com";
25:    "ADMIN_EMAIL=deploy-test@example.com",
```

Output of the second command: (none; no match, as expected)

## Step 21: openspec validation

Commands: `openspec validate fly-dual-environment-deploys --strict` and `openspec validate --specs`

Exit status: 0 for both commands.

Output of the first command:

```
Change 'fly-dual-environment-deploys' is valid
```

Output of the second command:

```
- Validating...
✓ spec/admin-credentials
Totals: 1 passed, 0 failed (1 items)
```

## Step 22: status probe in scripts/deploy.ts

Commands: `grep -c 'status' scripts/deploy.ts` and `grep -n 'apps.*list\|"status"' scripts/deploy.ts`

Exit status: 0 for both commands.

Output of the first command:

```
13
```

Output of the second command:

```
131:  const result = fly(["status", "--app", app, "--json"], true);
```

The app-existence probe (`probeApp`) now runs a single per-app status read: `flyctl status --app <app-name> --json`. The `apps.*list` pattern matched nothing, so no account-wide `fly apps list` call remains in `scripts/deploy.ts`.

---

Steps whose output did not match the stated expectation: step 16 only (credential refusal printed instead of the config-file mismatch message, because the missing-variable check runs first in `scripts/deploy.ts`).

No deployed app was contacted, no token was minted, no secret was written, and no app was created or destroyed during this verification.
