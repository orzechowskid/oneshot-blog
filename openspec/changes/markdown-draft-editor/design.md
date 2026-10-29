## Context

The motivation and scope are in `proposal.md`. The behaviour contract is `specs/blog-drafting/spec.md`. The contract wins over this document on any conflict. The owner's decisions D1 to D10 are settled in plain words and are fixed, not options.

The current app stores one content set per post row. `posts` has `slug`, `title`, `body_markdown`, `excerpt`, `status`, `published_at`, `created_at`, and `updated_at` (db/schema.sql:8-18). `slug` is UNIQUE across all rows (db/schema.sql:10). `status` is `draft` or `published` (db/schema.sql:14). The public queries name their columns explicitly and filter on `status = 'published'` (app/lib/posts.server.ts:61, :72). Every save rewrites the published columns, so a draft saved on a published post changes what readers see at once (app/lib/posts.server.ts:125-153).

The editor is one form. It is a react-router `Form` with method `post` (app/components/PostForm.tsx:30), with fields for title (:35), slug (:43), body (:51), excerpt (:60), and a "Publish this post" checkbox (:66-72). The form reader reads the checkbox (app/lib/validation.ts:26), derives a slug from the title when the slug field is empty (app/lib/validation.ts:30), and derives the excerpt from the body when the excerpt field is empty (app/lib/validation.ts:32). The non-empty body rule is at app/lib/validation.ts:54-55. The routes map the checkbox to `status` (app/lib/posts.server.ts:116, :148).

The new-post action has no intent handling. It is a single create path (app/routes/admin-new.tsx:10-23). The edit action reads `intent` (app/routes/admin-edit.tsx:64) and branches on `delete` (:66), `delete-image` (:71), `upload-image` (:79), and the default update path (:103-112). The whole-post delete form is at app/routes/admin-edit.tsx:235-246.

Authentication is session based. `requireUser` redirects to `/login` when the session is missing (app/lib/auth.server.ts:62-70, redirect at :67). The cookie is `blog_session`, httpOnly, SameSite=Lax (app/lib/auth.server.ts:10, :24-32). The CSRF guard is `assertSameOrigin`, a `Sec-Fetch-Site` plus `Origin` check with no token field (app/lib/csrf.server.ts:1-25). A same-origin browser fetch passes both checks. No CSRF form field exists.

The stack is React Router 8.5.0 (package.json:37), Vite 8.3.5 (package.json:56), `ssr: true` (react-router.config.ts:4), `plugins: [reactRouter()]` (vite.config.ts:5). React Router 8 keeps only the `default`, `meta`, and `links` exports of a route module in the client graph and strips `loader` and `action` exports. Evidence in the current build, measured: four client chunks (health, image, logout, seed) are 0 bytes because those routes export only loaders and actions. Only `app/lib/format.ts` and `app/lib/markdown.ts` reach the browser today. `app/lib/markdown.ts` imports `marked` and `sanitize-html` (app/lib/markdown.ts:1-2), and its `renderMarkdown` is used loader-only at app/routes/post.tsx:17.

Client bundle baseline, measured: 23 client JS files, 481,765 bytes total, 154,781 bytes gzipped. The admin-edit chunk is 49,888 bytes raw and 14,839 bytes gzipped and contains `marked`, because `markdownImageSnippet` is called in a component render (app/routes/admin-edit.tsx:213). `sanitize-html`, `htmlparser2`, `postcss`, `entities`, and `parse-srcset` are absent from all client chunks today. A probe that wires `renderMarkdown` into the admin-edit render, measured with the real toolchain: the admin-edit chunk grows from 49,888 to 203,824 bytes (+153,936 raw, +55,742 gzipped), and total client JS grows from 481,765 to 636,035 bytes (+154,270 raw, +55,839 gzipped). `sanitize-html`, `postcss`, `htmlparser2`, and `entities` all become present in the admin-edit client chunk. An esbuild-only probe of the same module, measured, gave 207,782 bytes minified and 73,025 bytes gzipped and ran in Chromium with no page errors.

The database is PostgreSQL 16 (docker-compose.yml:3), driver `pg` 8.23.1 (package.json:33). `ensureSchema` sends `db/schema.sql` as one multi-statement query (app/lib/db.server.ts:41-42, :72). `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is valid on this engine, and `db/schema.sql` has no ALTER statements today, measured: the file contains only CREATE TABLE and CREATE INDEX.

Existing tests: the integration tests click "Publish this post" (tests/integration/blog.spec.ts:50, :88) and "Create post" and "Save post" (:51, :70, :89). The Storybook specs iterate hardcoded lists of six colocated stories (tests/storybook/visual.spec.ts:3-16, tests/storybook/accessibility.spec.ts:4-17). `PostForm` has no story, measured: app/components has stories for Button, Checkbox, FormErrorSummary, MarkdownContent, PostCard, and TextField only. The repo precedent for JSON error responses is an object with an `error` field, with statuses 400, 403, and 409 (app/routes/seed.tsx:15-54).

## Goals / Non-Goals

**Goals:**
- A Markdown body editor whose preview uses the same Markdown rules and sanitization as public posts (spec: "Markdown editor shows a live sanitized preview").
- Store the latest draft separately from published content, so a draft save on a published post changes nothing readers see (spec: "Draft saves do not change published content").
- Save drafts explicitly and automatically after three seconds of idle typing when a title is present. A first autosave on a new post creates one draft-only post (D3).
- Publish is the only path that changes publication state (D2). Publishing promotes the draft and updates the publication times (spec: "Publishing promotes the draft").
- The admin list shows three post states and the last change time (D5).
- Warn before unsaved edits are lost on reload and tab close (D9).

**Non-Goals:**
- Draft version history. Only the latest draft is stored.
- In-app navigation guards (D9; spec: "In-app navigation is not guarded (explicit limit)").
- Any path that takes a published post off the public site (D2; see Decision 10).
- Multiple authors or collaborative editing.
- Changes to the public post layout or the Markdown feature set.
- Uploading images before the first draft save. Images attach to an existing post row (app/routes/admin-edit.tsx:79).

## Decisions

### 1. Draft content lives in four new nullable columns on the post row

A post row keeps its published content in the existing columns and its latest draft in four new nullable columns.

The columns are `draft_title` (text), `draft_body_markdown` (text), `draft_excerpt` (text), and `draft_updated_at` (timestamptz), all nullable. A null `draft_title` means no draft is attached. `draft_updated_at` is the last draft save time on a published row.

`draft_slug` is dropped because of D1: a published post keeps its public address, so a draft attached to a published post always has the published address, the row's `slug` (db/schema.sql:10). A draft address column would have no value to hold that is different from the stored slug.

Draft-only posts, posts that have never been published, keep their content in the existing columns `title`, `slug`, `body_markdown`, `excerpt`, per the original design, with `status = 'draft'` (db/schema.sql:14). Their last change time is the existing `updated_at` (db/schema.sql:17).

The rejected alternative is a separate `post_drafts` table. It adds a join for the admin list indicator and a second storage path for draft-only posts. The column approach keeps one row per post, keeps post identity stable, and is the smaller change.

### 2. Each action owns a fixed set of fields

Each intent writes only the fields that belong to it, so a draft save cannot touch the published content.

The exact rules. A draft save on a draft-only row (`status = 'draft'`) writes `title`, `slug`, `body_markdown`, `excerpt`, and `updated_at`, and touches no publication time. The slug goes through the existing all-row collision check with a numeric suffix (app/lib/posts.server.ts:44-56). A draft save on a published row writes only `draft_title`, `draft_body_markdown`, `draft_excerpt`, and `draft_updated_at`, and touches no published column and no publication time. A publish is split into two branches. Draft-only row: keep the existing content columns `title`, `slug`, `body_markdown`, `excerpt` and the stored address, set `status = 'published'`, set `published_at` only when it is currently null so the first publication time is recorded, set `updated_at`, and clear the four draft columns. Published row: copy `title`, `body_markdown`, and `excerpt` from the draft columns, keep the stored address, set `status = 'published'`, set `published_at` only when it is currently null so a republish keeps the first publication time (spec: "Republishing a published post with a draft"), set `updated_at`, and clear the four draft columns. In both branches the address never changes on publish, for any row (D1). The split is required, not optional: on a draft-only row the four draft columns are null while `title` and `body_markdown` are NOT NULL (db/schema.sql:11-12), so a single "copy from the draft columns" write would fail with a not-null violation and the main publish path would return a server error. A discard draft sets the four draft columns and `draft_updated_at` to null and touches nothing else (D4).

`updatePost` is removed with the `update` intent (Decision 4). It wrote `slug`, `title`, `body_markdown`, `excerpt`, `status`, `published_at`, and `updated_at` on every call (app/lib/posts.server.ts:125-153). Its `published_at` CASE cleared the publication time whenever the resulting status was `draft` (app/lib/posts.server.ts:135-139), and its SET list overwrote the published columns of a published row (app/lib/posts.server.ts:129-134). No draft save or publish is routed through it.

### 3. Address rules

The address control is read-only while editing a published post, and the server ignores a submitted address for a published row (D1).

The server-side guard is needed because the form reader derives a slug from the title when the slug field is empty (app/lib/validation.ts:30). A request that leaves the address field blank still carries a derived value, so the read-only control alone cannot stop an address change. Draft saves on new and draft-only posts keep the existing all-row collision check with a numeric suffix (app/lib/posts.server.ts:44-56), which is D10: a draft save whose address is taken appends a numeric suffix, saves, and the editor shows the resulting address.

The old design claim that slug resolution is scoped to published posts is deleted. That scope was wrong: `slug` is UNIQUE across all rows (db/schema.sql:10), so a draft save whose address is taken by another draft row would write a taken value into a UNIQUE column and produce a server error instead of a field error, and the post would not be saved.

Collisions end in a field error, never a server error. The collision check runs before the write, so two concurrent draft saves can both see a free candidate and one write then violates the UNIQUE constraint (db/schema.sql:10). A database unique violation on a draft save is caught, the draft is saved under the resulting suffixed address, and the result carries a field error on the address naming that address, so the editor shows it. The 50-attempt cap in the collision check (app/lib/posts.server.ts:45) returns a field error, not a thrown Error. Tests must cover the collision path.

### 4. Intents

Every mutation carries an intent, and the accepted intents are `save-draft`, `publish`, `discard-draft`, `delete`, `delete-image`, and `upload-image`. There is no plain submit and no default branch.

The new-post form has **Save draft** and **Publish** controls, and every mutation from it carries an intent. A publish on the new-post route creates the row already published, after the publish validation passes, and the row keeps the address the form holds. The edit form has **Save draft**, **Publish**, and **Discard draft**, plus the existing whole-post delete and image controls. **Discard draft** exists only on the edit route: the spec gives a draft-only post no discard action (spec: "A draft-only post has no discard action").

The `update` intent is removed, and `updatePost` is removed with it. Today `update` is the live default: a missing intent is read as `update` (app/routes/admin-edit.tsx:64), and the default path calls `updatePost` (app/routes/admin-edit.tsx:109), whose SET list writes `status` (app/lib/posts.server.ts:129-134) and whose `published_at` CASE sets `published_at` to null when the resulting status is `draft` (app/lib/posts.server.ts:135-139). With the publish checkbox removed, `readPostForm` reads the absent `published` field as not published (app/lib/validation.ts:26), so any submission without an intent demotes a published post. The only caller of `updatePost` is app/routes/admin-edit.tsx:109. The removal is part of the intentional removal of the unpublish path (Decision 10).

A mutation with no intent performs no write. The editor is returned with an error naming the missing action.

Server-side rule for D6: a publish on a published row with no attached draft (all four draft columns null) is rejected. The disabled control in the UI is not the only guard. Recommendation: reject with HTTP 409 as a state conflict, matching the existing conflict response (app/routes/seed.tsx:50).

### 5. Autosave

The editor saves the draft automatically after three seconds of idle input, and only when a title is present (D3).

The timer resets on each change. When it fires, the editor sends the form data with `intent=save-draft` and `autosave=1` to the autosave route with a same-origin fetch. The `autosave` field is the marker that tells the server the two cases apart: autosave requests send `autosave=1`; explicit saves send no `autosave` field and keep the existing redirect behaviour (app/routes/admin-new.tsx:22, app/routes/admin-edit.tsx:112). Autosave fires on the new-post route too (D3).

The autosave and preview requests do not post to the admin routes. They go to two new top-level routes, `app/routes/admin-autosave.tsx` and `app/routes/admin-preview.tsx`, registered at the top level of app/routes.ts, not under the admin layout (app/routes.ts:16-20). The reason, measured by the reviewer: app/routes.ts:16-20 nests `admin`, `admin/new`, and `admin/:id/edit` under the admin layout, and the layout loader (app/routes/admin-layout.tsx:7-10) calls `requireUser`, which throws a redirect to the login page (app/lib/auth.server.ts:67). A mutation on a nested route re-runs the parent loaders, so an expired session gives the fetch a redirect to the login page and the editor reports saved when nothing was saved. Each new route exports an action only, calls `requireUser` and `assertSameOrigin` itself, and returns HTTP 401 with an error object when the session is absent. A client-side save-expiry scenario is added to the spec.

Mutations that return JSON must return a raw Response object. React Router 8 encodes a framework action result as turbo-stream, so plain JSON reaches the client only when the action returns a raw Response, following the precedent app/routes/seed.tsx:18-45. The client calls these two routes with fetch, not with the framework submit.

The response contract for the autosave and preview routes:

- On success, HTTP 200. The autosave response is an object carrying the post id, the stored address (the final slug after any suffix), and the save time; the preview response is an object carrying the rendered sanitized HTML.
- On validation failure, HTTP 400 with `error` and per-field messages.
- On session expiry, HTTP 401 with `error`. The new routes return this instead of the redirect `requireUser` throws (app/lib/auth.server.ts:62-70, redirect at :67).
- On origin check failure, HTTP 400, not 403: in framework mode the framework guard answers 400 with an encoded body before the action runs, so the action's own 403 (app/lib/csrf.server.ts:4) is not what the client sees.
- On a conflict, HTTP 409.

The status set is 200 for success, 400 for validation failure and origin rejection, 401 for session expiry, and 409 for conflict.

The address handoff is durable. After the first autosave creates a draft-only row, the editor stores the returned id, switches the form action to the edit route for that id, and replaces the browser location with that route, so a reload of a saved form continues the same post instead of starting a second draft. The explicit submit control is disabled while any save is in flight, which removes the double create from a click during the first autosave.

The client ignores older responses and applies the newest, so a late response from a superseded save cannot overwrite a newer state.

`requireUser` and `assertSameOrigin` already accept a same-origin fetch from the browser: the fetch presents `Sec-Fetch-Site` of `same-origin` or `none` and an `Origin` that matches the host, which passes the checks at app/lib/csrf.server.ts:1-25. No CSRF field is needed, and none exists (app/lib/csrf.server.ts:1-25).

### 6. Preview renders on the server (D7, D8)

The preview is rendered on the server and returned to the editor. The owner accepted this recommendation (D7).

The chosen mechanism is the preview route `app/routes/admin-preview.tsx` (Decision 5): a top-level route registered in app/routes.ts, not under the admin layout, exporting an action only, authenticated with `requireUser`, same-origin checked with `assertSameOrigin`, returning HTTP 401 with an error object when the session is absent, called by the client with a same-origin fetch after a 250 ms debounce, and returning rendered sanitized HTML produced by `renderMarkdown` (app/lib/markdown.ts:34-82) in a JSON body as a raw Response (Decision 5).

The editor takes its initial preview content as a prop. The editor route's loader renders the saved content with the same call the public post route uses (app/routes/post.tsx:17), using the attached draft when one is stored, otherwise the published content, and passes the HTML to the editor component. The component requests updates from the preview route after a 250 ms debounce, from the first paint on. This makes the Storybook story able to pass fixed HTML, and it keeps `app/lib/markdown.ts` out of the client graph.

First paint (D8): when the editor opens, the preview already shows the saved content, rendered on the server. The client updates the preview from the first paint on.

The rejected option is a client-side `renderMarkdown` call. Measured cost: wiring `renderMarkdown` into the admin-edit render grows the admin-edit chunk from 49,888 to 203,824 bytes (+153,936 raw, +55,742 gzipped) and total client JS from 481,765 to 636,035 bytes (+154,270 raw, +55,839 gzipped). `sanitize-html`, `postcss`, `htmlparser2`, and `entities` all become present in the admin-edit client chunk. The tree-shaking rule behind this is that React Router 8 keeps only the `default`, `meta`, and `links` exports in the client graph and strips `loader` and `action` exports, measured in the current build as four 0-byte client chunks for loader- and action-only routes.

Consequence for the editor component: the editor component and its Storybook story must not import `app/lib/markdown.ts`, so the `renderMarkdown` path and its dependency closure stay out of client code and total client JS stays at the measured baseline of 481,765 bytes raw and 154,781 bytes gzipped. Note that `app/lib/markdown.ts` is already reachable from the admin-edit client chunk today through the `markdownImageSnippet` import, which is called in a render (app/routes/admin-edit.tsx:19, :213) and pulls `marked` into the chunk, measured. The invariant is that no client code calls `renderMarkdown`, so the `sanitize-html` closure, absent from all client chunks today, measured, stays out.

The bundle budget check. `scripts/check-bundle-budget.ts` runs after `npm run build`. It sums the bytes of `build/client/assets/*.js`, fails when the total exceeds 490,000 bytes, and fails when any client chunk contains `sanitize-html`, `htmlparser2`, `postcss`, or `entities`. The baseline it guards is the measured 481,765 bytes raw and 154,781 bytes gzipped. The browser-rendered alternative, measured, is 636,035 bytes raw and 210,620 bytes gzipped.

### 7. Editor component

The body editor is a controlled component with a formatting toolbar, a two-column layout on wide screens, and a tab toggle on narrow screens.

The new component is `app/components/MarkdownEditor.tsx` (tasks 3.1-3.2). It owns the body text as controlled state. The formatting toolbar provides bold, italic, link, and inline code. Keyboard shortcuts cover the same four actions. On wide screens the body editor and the preview sit side by side in a two-column grid. On narrow screens a two-tab toggle switches between editing and previewing without losing the draft text (spec: "Narrow-screen toggle").

The preview region displays the rendered HTML the component is given: the initial value from the route loader, and updates from the preview route (Decision 6). The Storybook story passes fixed HTML the same way.

The preview region carries an accessible label. It is not a live region, because re-rendering on every debounced update would announce continuously to screen readers. Save state shows in a polite status region (`role="status"`). Save errors show in an alert region (`role="alert"`). The editor shows the four save states (spec: "The editor shows the save states"): saving, saved, unsaved, and failed to save. On an autosave failure the editor shows the error and keeps the draft marked unsaved (spec: "Autosave failure").

The component and its Storybook story must not import `app/lib/markdown.ts` (Decision 6). `PostForm` has no story today. The new story must follow the same rule.

### 8. Unsaved edits warn on reload and tab close only (D9)

While the form has unsaved edits, the browser warns before a reload or a tab close would drop them. In-app navigation is not guarded.

The editor registers a `beforeunload` handler while the form is dirty, that is, while any field differs from the last saved values, and removes it when the form is clean. This covers reload and tab close (spec: "Unsaved edits are protected on reload and tab close"). The form is a react-router `Form` with method `post` (app/components/PostForm.tsx:30). In-app links navigate through the router without a page unload, so no warning fires there. The spec states this limit explicitly (spec: "In-app navigation is not guarded (explicit limit)").

Limit on the test, measured: Chromium under Playwright emits a dialog of type `beforeunload` with an empty message when a reload starts while the form is dirty. Dismissing the dialog aborts the navigation, so the editor keeps the typed text, and a `page.reload()` awaited after a dismissed dialog never resolves and stays pending until the test times out. Accepting the dialog lets the reload proceed, and the editor comes back with the saved content, so the typed text is gone. The reload half is covered by the integration test `reloading with unsaved edits warns, and dismissing keeps the typed text while accepting reloads the editor to the stored content` in tests/integration/autosave.spec.ts, which is one of the four tests currently failing in the suite. The tab-close half stays unobservable: a closed tab cannot be inspected. The handler registration is asserted in tests/unit/beforeunload.test.ts, which asserts source text.

### 9. Admin list shows three states and the last change time (D5)

The admin list shows every post as draft, published, or published with a draft attached, and its time column is the post's last change.

The three states: `Draft` for rows with `status = 'draft'`. `Published` for published rows with no attached draft (all four draft columns null). `Published with draft attached` for published rows with `draft_title` not null. The View control appears only for published rows. That gate exists today (app/routes/admin-index.tsx:54-56). The column header is renamed from "Updated" (app/routes/admin-index.tsx:35) to name the time as the post's last change.

The ordering rule is `ORDER BY COALESCE(draft_updated_at, updated_at) DESC`, replacing the current `ORDER BY updated_at DESC` (app/lib/posts.server.ts:86). How each state gets its time: a published row with an attached draft uses `draft_updated_at`, the last draft save time. A published row without a draft uses `updated_at`, which the publish action sets on every publish (Decision 2), so it is the last publication time. A draft-only row uses `updated_at`, which a draft save on a draft-only row sets (Decision 2), so it is the last save time. Saving a draft on a draft-only post advances `updated_at`, so the row moves in the list (D5; spec: "Saving a draft on a draft-only post moves its row").

### 10. Unpublish removal (D2)

Removing the publish checkbox removes the app's only unpublish path, and the owner accepted this removal as intentional.

Today, unchecking "Publish this post" (app/components/PostForm.tsx:66-72) sends `published=false`, which maps to `status = 'draft'` (app/lib/posts.server.ts:148), and the `published_at` CASE in `updatePost` clears the publication time (app/lib/posts.server.ts:135-139). No other path moves a row out of `published`. With the checkbox removed and publication state changing only through Publish (D2), the app has no unpublish path. This is recorded as an intentional removal of a capability.

The edit action has the same live path in its default intent. A missing intent is read as `update` (app/routes/admin-edit.tsx:64), and the default path calls `updatePost` (app/routes/admin-edit.tsx:109), whose SET list writes `status` (app/lib/posts.server.ts:129-134) and whose `published_at` CASE sets `published_at` to null when the resulting status is `draft` (app/lib/posts.server.ts:135-139). With the checkbox removed, `readPostForm` reads the absent `published` field as not published (app/lib/validation.ts:26), so any submission without an intent demotes a published post. The `update` intent and `updatePost` are removed with the checkbox (Decision 4), and a mutation with no intent performs no write and returns the editor with an error naming the missing action.

The existing integration tests click "Publish this post" (tests/integration/blog.spec.ts:50, :88) and depend on the control being removed. They must be rewritten to use the new Publish button, alongside the existing "Create post" and "Save post" clicks (:51, :70, :89).

## Risks / Trade-offs

- **Autosave creates a row before any button is pressed.** A title alone fires autosave (D3), so a row can exist before the owner presses any button. Recovery: discard draft on a published post (D4), whole-post delete on a draft-only post (app/routes/admin-edit.tsx:66, :235-246).
- **Last-write-wins on concurrent saves.** Two saves for the same post race, and the later database write wins. There is no concurrency token. The client ignores older responses and applies the newest (Decision 5), which bounds the visible effect to the same editor.
- **A draft-only post holds an address.** `slug` is UNIQUE across all rows (db/schema.sql:10), so a saved draft-only post keeps its address. A later post saved with the same address is saved with a different address, and the original draft keeps its address (spec: "A stored draft holds its address against later posts"). The numeric suffix comes from the existing collision check (app/lib/posts.server.ts:44-56).
- **The autosave session-expiry path returns 401 JSON instead of a redirect.** A fetch cannot follow the redirect at app/lib/auth.server.ts:67 silently, so an autosave with an expired session gets a 401 with an `error` (Decision 5). The editor shows the failed-to-save state. Explicit navigation still redirects to login.
- **The meaning of `updated_at` for rows that exist today.** For rows published before this change, `updated_at` is the last save time, not the last publication time, so the last-change column shows a save time until that post is published again, when the publish action sets `updated_at`. No reader-visible page changes, because public pages read `published_at` (app/routes/post.tsx:39-40, app/components/PostCard.tsx:15-17).
- **Preview round trip, estimated.** Each debounced preview costs one same-origin request and one server render. That is the price of keeping the `sanitize-html` closure out of the client bundle (Decision 6). Estimated cost: one extra request per pause of more than 250 ms while editing.
- **A double create from a click during the first autosave.** The first autosave creates the draft-only row, and a click of the explicit save control while that save is in flight could create a second draft. Control: the explicit submit control is disabled while any save is in flight (Decision 5).
- **A lost id handoff starts a second draft.** If the editor never receives or stores the id of the row the first autosave created, the form still points at the new-post route, and a later save creates a second draft row, which the collision check saves under a suffixed address. Control: the editor stores the returned id and replaces the browser location with the edit route for that id (Decision 5), so a reload continues the same post; a stray draft-only row is removed by the whole-post delete (app/routes/admin-edit.tsx:66).
- **A UNIQUE violation on concurrent draft saves.** The collision check (app/lib/posts.server.ts:44-56) runs before the write, so two concurrent saves can both see a free candidate and one write then violates the UNIQUE constraint (db/schema.sql:10). Control: a database unique violation on a draft save is caught and the draft is saved under the resulting suffixed address, reported as a field error on the address, never a server error (Decision 3).
- **The tab-close warning is unobservable in Chromium under Playwright.** A closed tab cannot be inspected, so the tab-close half of the unsaved-edits warning cannot be asserted in the integration suite. Measured: Chromium under Playwright emits a `beforeunload` dialog on reload, so the reload half is asserted there by the test named in Decision 8, which currently fails. Control: the handler registration is asserted in tests/unit/beforeunload.test.ts, which asserts source text (Decision 8).
- **The admin layout loader redirects, which is why autosave and preview sit outside it.** app/routes.ts:16-20 nests the admin routes under the admin layout, whose loader (app/routes/admin-layout.tsx:7-10) calls `requireUser` and throws a redirect (app/lib/auth.server.ts:67); a mutation on a nested route re-runs the parent loaders, so an expired session gives the fetch a redirect to the login page and the editor reports saved when nothing was saved. Control: the autosave and preview routes are top-level routes that authenticate themselves and return 401 (Decision 5).

## Residual risks, accepted

These items are accepted and stay open:

- An explicit save on an expired session drops the typed text. The explicit save goes through the admin routes, whose loaders redirect to the login page when the session is absent, and the form is replaced; the autosave 401 path keeps the typed text, the explicit path does not.
- Text typed during an in-flight submit is overwritten by the field re-seed. A save response re-seeds the form fields from the stored values, so a change typed while the save is in flight is replaced when the response lands.
- An image attached to a draft-only post is served at `/images/<id>` with no status gate. The image route does not check the post's publication state, and the gap pre-dates this change.
- The bundle budget does not gate CSS. `scripts/check-bundle-budget.ts` sums and caps client JavaScript only; CSS bytes are reported, not gated.

## Migration Plan

Append four idempotent statements to `db/schema.sql`:

```sql
ALTER TABLE posts ADD COLUMN IF NOT EXISTS draft_title text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS draft_body_markdown text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS draft_excerpt text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS draft_updated_at timestamptz;
```

`ensureSchema` sends `db/schema.sql` as one multi-statement query on startup (app/lib/db.server.ts:41-42, :72), so existing databases gain the columns on the next start, with no separate migration command. `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is valid on PostgreSQL 16 (docker-compose.yml:3). The statements are idempotent, so re-running the schema is a no-op where the columns exist. `db/schema.sql` has no ALTER statements today, measured.

Verify with `npm run db:up`, then `node --env-file-if-exists=.env scripts/reset-db.ts`. The reset script drops all tables and recreates them from `db/schema.sql` (scripts/reset-db.ts:16-20).

No backfill. After the change:

- Existing published rows: the four draft columns are null, so the row shows `Published` with no draft attached. Its time column shows `updated_at`, the last save time, until the post is published again (Risks).
- Existing draft-only rows: the four draft columns are null, so the row shows `Draft`. Its content stays in the existing columns. Its time column shows `updated_at`, the last save time.
- Existing timestamps are unchanged. The new columns are nullable and added without defaults, so no existing value is touched.

Rollback is code-only. The old code ignores the new nullable columns, so the columns can stay. If a full schema rollback is required, drop the four columns after backing up any attached drafts.

## Verification

```
npm run typecheck
npm run test
npm run build
node scripts/check-bundle-budget.ts
npm run test:integration
npm run test:storybook
npx --no-install openspec validate markdown-draft-editor --strict
```

`node scripts/check-bundle-budget.ts` runs after `npm run build` and enforces the budget stated in Decision 6. The last command needs a global openspec CLI; it is not in package.json, and this machine has it.
