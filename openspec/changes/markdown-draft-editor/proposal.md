## Why

The current editor is a plain body textarea, so the owner cannot see the rendered post while drafting. A save rewrites the published columns on the post row, so a change saved on a published post changes what readers see at once. This change gives the owner a Markdown drafting surface with a live rendered preview and a stored draft version that can be saved without changing the public post.

## What Changes

- Add a controlled Markdown body editor with a server-rendered live preview. The preview uses the same Markdown rules and sanitization as public posts. On wide screens the body editor and the preview sit side by side; on narrow screens a toggle switches between editing and previewing.
- Add a formatting toolbar and four keyboard shortcuts for bold, italic, link, and inline code.
- Add explicit **Save draft** and **Publish** actions to the editor.
- Remove the "Publish this post" checkbox. This also removes the app's only unpublish path, and that removal is intentional.
- Remove the update path together with the publish checkbox, because it is a second way to change publication state.
- Add a **Discard draft** action, available only on a published post with an attached draft.
- Save drafts automatically after three seconds of idle typing when a title is present.
- Let a draft be stored with a title and an empty body. Publishing requires a non-empty body.
- Store the latest draft separately from the published content, so a draft save never changes what readers see. Keep only the latest draft.
- Keep the public address of a published post fixed. The address control is read-only when editing a published post, and a submitted address is ignored for a published post. New and draft-only posts keep an editable address, and a taken address gains a numeric suffix.
- Show every post in the admin list as published, draft, or published with a draft attached, with a last-change time column.
- Track the first publication time and a last publication time.
- Send automatic saves and preview requests to two dedicated endpoints outside the admin layout, so an expired session reports a failure to the editor instead of returning a login page.
- Add a browser bundle budget check that proves the preview change adds nothing to the browser download.
- Preserve the sanitized GitHub-Flavored Markdown rules for the preview and for published posts.

## Capabilities

### New Capabilities

- `blog-drafting`: Markdown editing, live preview, draft persistence, publishing, discard, address stability, and admin indicators.

### Modified Capabilities

- None, because `openspec/specs` is empty.

This change removes the app's only unpublish path, and the loss is recorded in the `blog-drafting` requirement set.

## Impact

The preview renders on the server and adds nothing to the browser download. Measured: browser rendering of the preview costs +154,270 bytes raw and +55,839 bytes gzipped on top of 481,765 bytes raw and 154,781 bytes gzipped of client JavaScript; the server preview endpoint adds nothing to that total; the budget script enforces the rule with a 490,000 byte ceiling.

Affected and new files:

- `db/schema.sql`
- `app/lib/posts.server.ts`, including the removal of `updatePost`
- `app/lib/validation.ts`
- `app/lib/validation.test.ts`
- `app/components/PostForm.tsx`
- new `app/components/MarkdownEditor.tsx`
- new `app/components/MarkdownEditor.module.css`
- new `app/components/MarkdownEditor.stories.tsx`
- new `app/routes/admin-preview.tsx` and `app/routes/admin-autosave.tsx`
- `app/routes.ts`
- `app/routes/admin-new.tsx`
- `app/routes/admin-edit.tsx`
- `app/routes/admin-index.tsx`
- new `scripts/check-bundle-budget.ts`
- `tests/integration/blog.spec.ts`, rewritten for the removed checkbox
- new `tests/integration/drafts.spec.ts`
- `tests/storybook/visual.spec.ts` and `tests/storybook/accessibility.spec.ts`, for story registration

No new runtime dependency is needed. `app/lib/markdown.ts` is not edited and stays out of the browser bundle. The public and login routes are not changed.
