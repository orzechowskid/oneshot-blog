import { expect, test, type Page } from "@playwright/test";

// Scenarios from
// openspec/changes/markdown-draft-editor/specs/blog-drafting/spec.md
// ("Publishing promotes the draft", "Public posts expose only published
// content", "Publication state changes only through Publish", "Draft saves
// do not change published content"), one test per scenario, named after the
// scenario. Time assertions are read from the
// public post page and the admin list, never from the database.
//
// The conflict test sends a plain POST to the edit action with the
// page's own session cookies and asserts status 409 with the conflict
// message in the response body. The in-editor form message is covered by
// the two-tab test "A publish rejected by a draft discarded in another
// tab keeps the editor and the typed text": the first tab discards the
// attached draft, the second tab publishes into the published row with no
// attached draft, and the editor keeps the typed title and shows the
// conflict message in the form error summary. The stale-guard message is
// not covered by a sequential browser test: a guard miss needs a publish
// to land between the route's fresh read of the row and its guarded
// UPDATE, that is, two requests in flight at the same time. A test that
// publishes first, waits for the confirmation, and only then saves in a
// second tab takes the attached-draft write path and succeeds instead.
// Where the "Post saved." confirmation is already on screen from a
// previous save, the publish or draft-save waits for a loader re-render
// signal instead: the address control drops out of the form when a post
// becomes published, and the Discard draft control appears when a draft
// attaches and disappears when it clears.

const OWNER_EMAIL = process.env.BOOTSTRAP_EMAIL ?? "owner@example.com";
const OWNER_PASSWORD =
  process.env.BOOTSTRAP_PASSWORD ?? "test-owner-password";

// The conflict message the editor action shows when a publish request
// arrives for a published row with no attached draft.
const PUBLISH_CONFLICT_MESSAGE =
  "The post is already published and has no draft to publish.";

// The admin list and the public post page format dates with the same
// en-US UTC formatter as app/lib/format.ts, so the test formats its own
// "today" the same way and compares readable date strings.
function readableDate(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(value);
}

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/admin/);
}

type PostFields = {
  title: string;
  slug: string;
  body: string;
  excerpt: string;
};

async function fillPostForm(page: Page, fields: PostFields): Promise<void> {
  await page.getByLabel("Title").fill(fields.title);
  await page.getByLabel("Slug").fill(fields.slug);
  await page.getByLabel("Body").fill(fields.body);
  await page.getByLabel("Excerpt").fill(fields.excerpt);
}

async function saveDraft(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Post saved.")).toBeVisible();
}

async function publish(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Post saved.")).toBeVisible();
}

// After a save the editor URL is /admin/<id>/edit?saved=1.
function editPostId(page: Page): string {
  const id = page.url().match(/\/admin\/([0-9a-f-]+)\/edit/)?.[1] ?? "";
  expect(id, `Expected an edit URL, got ${page.url()}`).not.toBe("");
  return id;
}

type PageTime = { text: string; iso: string };

// The public post page renders exactly one <time>: the first publication
// time (published_at, falling back to updated_at).
async function publicPostTime(page: Page, slug: string): Promise<PageTime> {
  await page.goto(`/posts/${slug}`);
  const time = page.locator("time");
  await expect(time).toHaveCount(1);
  return {
    text: (await time.textContent())?.trim() ?? "",
    iso: (await time.getAttribute("dateTime")) ?? "",
  };
}

// The admin list row for a post; its <time> element is the post's last
// change.
function adminRow(page: Page, title: string) {
  return page.getByRole("row", { name: title });
}

test("First publication", async ({ page }) => {
  const fields: PostFields = {
    title: "First publication post",
    slug: "first-publication-post",
    body: "First publication body. **Kept** marker.",
    excerpt: "First publication excerpt.",
  };
  await login(page);

  // Save the new post as a draft-only post: it is not public yet.
  await page.goto("/admin/new");
  await fillPostForm(page, fields);
  await saveDraft(page);

  const draftNotPublic = await page.request.get(`/posts/${fields.slug}`);
  expect(draftNotPublic.status()).toBe(404);

  // Publish the draft-only post from the editor.
  await publish(page);
  // The "Post saved." confirmation was already on screen from the draft
  // save, so wait for the loader re-render: a published post shows the
  // address as a read-only control that is no longer part of the form.
  await expect(page.locator('input[name="slug"]')).toHaveCount(0);

  // The post is visible on the public site at the address the draft held,
  // and the first publication time is recorded as today's date.
  const first = await publicPostTime(page, fields.slug);
  await expect(
    page.getByRole("heading", { level: 1, name: fields.title }),
  ).toBeVisible();
  await expect(page.locator("strong")).toHaveText("Kept");
  expect(first.text).toBe(readableDate(new Date()));

  // The draft is cleared: the admin list shows the post as published with
  // no attached draft, and the editor offers no discard control.
  await page.goto("/admin");
  const row = adminRow(page, fields.title);
  await expect(row.getByText("Published", { exact: true })).toBeVisible();
  await row.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByRole("button", { name: "Discard draft" })).toHaveCount(0);
});

test("Publishing a draft-only post publishes the stored values", async ({ page }) => {
  const fields: PostFields = {
    title: "Stored values post",
    slug: "stored-values-post",
    body: "Stored body content. **Stored** marker.",
    excerpt: "Stored excerpt text.",
  };
  await login(page);

  // Save the draft-only post; the editor then opens with the stored values.
  await page.goto("/admin/new");
  await fillPostForm(page, fields);
  await saveDraft(page);

  // Publish without changing any field. The draft-only row has no attached
  // draft, so the content, address, and excerpt already stored on the row
  // are the values that become public, and no value is taken from an empty
  // draft field.
  await publish(page);
  // The "Post saved." confirmation was already on screen from the draft
  // save, so wait for the loader re-render: a published post shows the
  // address as a read-only control that is no longer part of the form.
  await expect(page.locator('input[name="slug"]')).toHaveCount(0);

  // The stored content is public at the stored address.
  const published = await publicPostTime(page, fields.slug);
  await expect(
    page.getByRole("heading", { level: 1, name: fields.title }),
  ).toBeVisible();
  await expect(page.locator("strong")).toHaveText("Stored");
  expect(published.text).toBe(readableDate(new Date()));

  // The stored address is the public address, and the stored excerpt is the
  // public excerpt in the listing. The assertions are scoped to this post's
  // card because the listing also carries the other posts' titles and
  // excerpts.
  await page.goto("/");
  const card = page
    .locator("article")
    .filter({ has: page.getByRole("link", { name: fields.title }) });
  await expect(card).toHaveCount(1);
  const link = card.getByRole("link", { name: fields.title });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", `/posts/${fields.slug}`);
  await expect(card.getByText(fields.excerpt)).toBeVisible();
});

test("Publish writes the validated content in the same request", async ({
  page,
}) => {
  const fields: PostFields = {
    title: "Immediate publish post",
    slug: "immediate-publish-post",
    body: "",
    excerpt: "Immediate publish excerpt.",
  };
  // The body typed into the editor after the empty-body draft save. It is
  // published before the three-second autosave can store it, so the
  // publish request itself must store it.
  const typedBody = "Immediately typed body with a **typed** marker.";
  await login(page);

  // Save a draft-only post with an empty body: the spec accepts a draft
  // with a title and an empty body.
  await page.goto("/admin/new");
  await fillPostForm(page, fields);
  await saveDraft(page);

  // Type a body and publish immediately, within the three-second idle
  // window, so no autosave has stored the typed text.
  await page.getByLabel("Body").fill(typedBody);
  await publish(page);
  // The "Post saved." confirmation was already on screen from the draft
  // save, so wait for the loader re-render: a published post shows the
  // address as a read-only control that is no longer part of the form.
  await expect(page.locator('input[name="slug"]')).toHaveCount(0);

  // The public post at the stored address shows the typed body, not the
  // stored empty body.
  await page.goto(`/posts/${fields.slug}`);
  await expect(
    page.getByRole("heading", { level: 1, name: fields.title }),
  ).toBeVisible();
  // The rendered body carries the typed text; the marker is rendered as
  // strong, so assert the surrounding text and the strong separately.
  await expect(page.getByText("Immediately typed body with a")).toBeVisible();
  await expect(page.locator("strong")).toHaveText("typed");
});

test("Republishing a published post with a draft", async ({ page }) => {
  const fields: PostFields = {
    title: "Republish post",
    slug: "republish-post",
    body: "First publication body. **First** marker.",
    excerpt: "Republish excerpt.",
  };
  const draftBody = "Second publication body. **Second** marker.";
  await login(page);

  // First publication.
  await page.goto("/admin/new");
  await fillPostForm(page, fields);
  await saveDraft(page);
  await publish(page);
  // The "Post saved." confirmation was already on screen from the draft
  // save, so wait for the loader re-render: a published post shows the
  // address as a read-only control that is no longer part of the form.
  await expect(page.locator('input[name="slug"]')).toHaveCount(0);

  const first = await publicPostTime(page, fields.slug);

  // The last publication time is the row's last change in the admin list.
  await page.goto("/admin");
  const row = adminRow(page, fields.title);
  const firstLastChange = await row.locator("time").getAttribute("dateTime");
  await row.getByRole("link", { name: "Edit" }).click();

  // Attach a draft with the new content, then publish it.
  await page.getByLabel("Body").fill(draftBody);
  await saveDraft(page);
  // Wait for the loader re-render: the draft is attached, so the Discard
  // draft control appears.
  await expect(
    page.getByRole("button", { name: "Discard draft" }),
  ).toBeVisible();
  // Keep the two publication times apart by a readable margin so the
  // "the last publication time moves" comparison cannot tie.
  await page.waitForTimeout(1100);
  await publish(page);
  // Wait for the loader re-render: the draft is cleared, so the Discard
  // draft control disappears.
  await expect(
    page.getByRole("button", { name: "Discard draft" }),
  ).toHaveCount(0);

  // The published content is replaced at the same address, and the first
  // publication time stays unchanged.
  const after = await publicPostTime(page, fields.slug);
  await expect(page.locator("strong")).toHaveText("Second");
  await expect(page.getByText("First publication body")).toHaveCount(0);
  expect(after.iso).toBe(first.iso);
  expect(after.text).toBe(first.text);

  // The draft is cleared and the last publication time moved in the admin
  // list.
  await page.goto("/admin");
  const rowAfter = adminRow(page, fields.title);
  await expect(rowAfter.getByText("Published", { exact: true })).toBeVisible();
  const secondLastChange = await rowAfter.locator("time").getAttribute("dateTime");
  // Both values are ISO strings from the same formatter; compare the
  // instants they name.
  expect(new Date(secondLastChange ?? "").getTime()).toBeGreaterThan(
    new Date(firstLastChange ?? "").getTime(),
  );
});

test("Saving a draft on a published post", async ({ page }) => {
  const fields: PostFields = {
    title: "Draft save published post",
    slug: "draft-save-published-post",
    body: "Published body with a **kept** marker.",
    excerpt: "Draft save published excerpt.",
  };
  const draftValues = {
    title: "Draft save draft title",
    body: "Draft body with a **draft** marker.",
    excerpt: "Draft save draft excerpt.",
  };
  await login(page);

  // Publish a new post directly; the editor is open on the published post.
  await page.goto("/admin/new");
  await fillPostForm(page, fields);
  await publish(page);
  // Wait for the loader re-render: a published post shows the address as a
  // read-only control that is no longer part of the form.
  await expect(page.locator('input[name="slug"]')).toHaveCount(0);

  // The publication time readers see before the draft save.
  const before = await publicPostTime(page, fields.slug);

  // Reading the time left the page on the public post: re-open the editor
  // from the admin list, the way the republish test does after its
  // public-page read.
  await page.goto("/admin");
  await adminRow(page, fields.title).getByRole("link", { name: "Edit" }).click();

  // Attach a draft with different content.
  await page.getByLabel("Title").fill(draftValues.title);
  await page.getByLabel("Body").fill(draftValues.body);
  await page.getByLabel("Excerpt").fill(draftValues.excerpt);
  await saveDraft(page);
  // Wait for the loader re-render: the draft is attached, so the Discard
  // draft control appears.
  await expect(
    page.getByRole("button", { name: "Discard draft" }),
  ).toBeVisible();

  // The admin list names the state.
  await page.goto("/admin");
  await expect(
    adminRow(page, fields.title).getByText(
      "Published with draft attached",
      { exact: true },
    ),
  ).toBeVisible();

  // The published title, body, and address stay unchanged: the post is
  // still served at its original address with the published content, and
  // the publication time is unchanged.
  const after = await publicPostTime(page, fields.slug);
  await expect(
    page.getByRole("heading", { level: 1, name: fields.title }),
  ).toBeVisible();
  await expect(page.locator("strong")).toHaveText("kept");
  await expect(page.getByText(draftValues.title)).toHaveCount(0);
  await expect(page.getByText(draftValues.body)).toHaveCount(0);
  expect(after.iso).toBe(before.iso);
  expect(after.text).toBe(before.text);

  // The public listing keeps the published excerpt for this post, not the
  // draft's. The positive assertion is scoped to this post's card because
  // the listing also carries the other posts' excerpts; the negative one
  // is page-wide: the draft excerpt must not appear anywhere on the public
  // site.
  await page.goto("/");
  const card = page
    .locator("article")
    .filter({ has: page.getByRole("link", { name: fields.title }) });
  await expect(card).toHaveCount(1);
  await expect(card.getByText(fields.excerpt)).toBeVisible();
  await expect(page.getByText(draftValues.excerpt)).toHaveCount(0);

  // The draft content is stored: the editor reopens with the draft values.
  await page.goto("/admin");
  await adminRow(page, fields.title)
    .getByRole("link", { name: "Edit" })
    .click();
  await expect(page.getByLabel("Title")).toHaveValue(draftValues.title);
  await expect(page.getByLabel("Body")).toHaveValue(draftValues.body);
  await expect(page.getByLabel("Excerpt")).toHaveValue(draftValues.excerpt);
});

test("Publish is unavailable on a published post with no attached draft", async ({
  page,
}) => {
  const fields: PostFields = {
    title: "Publish guard post",
    slug: "publish-guard-post",
    body: "Guard body. **Guard** marker.",
    excerpt: "Guard excerpt.",
  };
  await login(page);

  // Publish a new post directly: the row is published with no attached
  // draft, and the editor is open on it.
  await page.goto("/admin/new");
  await fillPostForm(page, fields);
  await publish(page);

  // The Publish control is unavailable: no enabled Publish control exists.
  await expect(
    page.getByRole("button", { name: "Publish", exact: true }),
  ).toBeDisabled();
  await expect(
    page.locator('button[name="intent"][value="publish"]:enabled'),
  ).toHaveCount(0);

  // The server rejects a publish request for a published row with no
  // attached draft with a conflict. The disabled control is the UI half
  // of the guard (D6); the server guard answers with HTTP 409 carrying
  // the conflict message. The Publish control is disabled, so the test
  // posts to the edit action with the page's own session cookies instead
  // of clicking a control the browser never enables. The framework
  // answers a nested-route mutation with a document payload that embeds
  // the conflict message, not a bare JSON body, so the test asserts the
  // message in the response body text.
  const id = editPostId(page);
  const response = await page.request.post(`/admin/${id}/edit`, {
    form: {
      intent: "publish",
      title: fields.title,
      slug: fields.slug,
      body: fields.body,
      excerpt: fields.excerpt,
    },
  });
  expect(response.status()).toBe(409);
  expect(await response.text()).toContain(PUBLISH_CONFLICT_MESSAGE);

  // The post is still public at its address, unchanged.
  const published = await publicPostTime(page, fields.slug);
  expect(published.text).toBe(readableDate(new Date()));
  await expect(
    page.getByRole("heading", { level: 1, name: fields.title }),
  ).toBeVisible();
});

test("A reader sees published content, not the attached draft", async ({
  page,
}) => {
  const fields: PostFields = {
    title: "Draft attached post",
    slug: "draft-attached-post",
    body: "Published body with a **kept** marker.",
    excerpt: "Draft attached post published excerpt.",
  };
  const draftBody = "Draft body with a **hidden** marker.";
  const draftExcerpt = "Draft excerpt that must stay hidden.";
  await login(page);

  // Publish the post, then attach a draft with different content.
  await page.goto("/admin/new");
  await fillPostForm(page, fields);
  await publish(page);

  await page.getByLabel("Body").fill(draftBody);
  await page.getByLabel("Excerpt").fill(draftExcerpt);
  await saveDraft(page);
  // The "Post saved." confirmation was already on screen from the
  // publish, so wait for the loader re-render: the draft is attached, so
  // the Discard draft control appears.
  await expect(
    page.getByRole("button", { name: "Discard draft" }),
  ).toBeVisible();
  const id = editPostId(page);

  // The admin list names the state.
  await page.goto("/admin");
  await expect(
    adminRow(page, fields.title).getByText(
      "Published with draft attached",
      { exact: true },
    ),
  ).toBeVisible();

  // The editor preview shows the content the editor is editing, which is
  // the attached draft, and not the published content. The Body field and
  // the preview show the same saved content on the first paint.
  await page.goto(`/admin/${id}/edit`);
  const preview = page.getByLabel("Markdown preview");
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("Draft body with a");
  await expect(preview).not.toContainText("Published body with a");

  // The public post page shows the published content, not the draft.
  const response = await page.goto(`/posts/${fields.slug}`);
  expect(response?.status()).toBe(200);
  await expect(page.locator("strong")).toHaveText("kept");
  await expect(page.getByText("hidden marker")).toHaveCount(0);
  await expect(page.getByText(draftExcerpt)).toHaveCount(0);

  // The public listing shows the published excerpt for this post, not
  // the draft's. The positive assertion is scoped to this post's card
  // because the listing also carries the other posts' excerpts. The
  // negative one is page-wide: the draft excerpt must not appear anywhere
  // on the public site.
  await page.goto("/");
  const card = page
    .locator("article")
    .filter({ has: page.getByRole("link", { name: fields.title }) });
  await expect(card).toHaveCount(1);
  await expect(card.getByRole("link", { name: fields.title })).toBeVisible();
  await expect(card.getByText(fields.excerpt)).toBeVisible();
  await expect(page.getByText(draftExcerpt)).toHaveCount(0);
});

test("An address belonging to an unpublished draft is not found", async ({
  page,
}) => {
  const fields: PostFields = {
    title: "Unpublished draft post",
    slug: "unpublished-draft-address",
    body: "Draft body that is not public.",
    excerpt: "Unpublished excerpt.",
  };
  await login(page);

  // Save a draft-only post; its address belongs only to the draft.
  await page.goto("/admin/new");
  await fillPostForm(page, fields);
  await saveDraft(page);

  // A public request for the address is not found.
  const response = await page.goto(`/posts/${fields.slug}`);
  expect(response?.status()).toBe(404);

  // The post is absent from the public listing.
  await page.goto("/");
  await expect(page.getByRole("link", { name: fields.title })).toHaveCount(0);
});

test("The admin editor shows no control that unpublishes a published post", async ({
  page,
}) => {
  const fields: PostFields = {
    title: "No unpublish post",
    slug: "no-unpublish-post",
    body: "Always public body. **Public** marker.",
    excerpt: "No unpublish excerpt.",
  };
  await login(page);

  // Publish a new post directly; the editor is open on the published post.
  await page.goto("/admin/new");
  await fillPostForm(page, fields);
  await publish(page);

  // No publish checkbox and no unpublish control of any kind.
  await expect(page.locator('input[name="published"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /unpublish/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /unpublish/i })).toHaveCount(0);

  // The remaining state controls are the draft controls only, and the post
  // stays on the public site at its address.
  await expect(page.getByRole("button", { name: "Save draft" })).toBeEnabled();
  await expect(page.getByRole("link", { name: "View post" })).toBeVisible();
  const response = await page.goto(`/posts/${fields.slug}`);
  expect(response?.status()).toBe(200);
  await expect(page.locator("strong")).toHaveText("Public");
});

test("A publish rejected by a draft discarded in another tab keeps the editor and the typed text", async ({
  page,
}) => {
  const fields: PostFields = {
    title: "Discarded draft publish post",
    slug: "discarded-draft-publish-post",
    body: "Discarded draft publish body. **Discarded** marker.",
    excerpt: "Discarded draft publish excerpt.",
  };
  // The body typed in the first tab to attach a draft after the publish.
  const draftBody = "Draft body with a **changed** marker.";
  // The title typed in the second tab before the first tab discards the
  // attached draft; the rejected publish must keep it in the field.
  const secondTabTitle = "Discarded draft publish second tab title";
  await login(page);

  // Create a published post and stay on its editor.
  await page.goto("/admin/new");
  await fillPostForm(page, fields);
  await publish(page);
  // The "Post saved." confirmation is on screen from the publish, so wait
  // for the loader re-render: a published post shows the address as a
  // read-only control that is no longer part of the form.
  await expect(page.locator('input[name="slug"]')).toHaveCount(0);

  // Attach a draft with a body change.
  await page.getByLabel("Body").fill(draftBody);
  await saveDraft(page);
  // The "Post saved." confirmation was already on screen from the
  // publish, so wait for the loader re-render: the draft is attached, so
  // the Discard draft control appears and the Publish control is enabled.
  await expect(
    page.getByRole("button", { name: "Discard draft" }),
  ).toBeVisible();

  // Open the same editor in the second page of the same context: the
  // draft is attached, so its form loads with the draft values and the
  // Publish control is enabled.
  const id = editPostId(page);
  const other = await page.context().newPage();
  await other.goto(`/admin/${id}/edit`);

  // Type a marker into the second page's Title: the form is dirty.
  await other.getByLabel("Title").fill(secondTabTitle);

  // Discard the attached draft from the first page: the handler accepts
  // the confirm dialog, and the discard lands on the server before the
  // second page publishes.
  page.on("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Discard draft" }).click();
  // The "Post saved." confirmation was already on screen from the draft
  // save, so wait for the loader re-render: the draft is cleared, so the
  // Discard draft control disappears.
  await expect(
    page.getByRole("button", { name: "Discard draft" }),
  ).toHaveCount(0);

  // Publish from the second page: the action sees a published row with no
  // attached draft and answers 409 with the conflict form message. Playwright
  // exposes no navigation flag on a request, so the submission mode is proven
  // by what the browser does: a JavaScript form submission fetches and leaves
  // the main frame unloaded, so no framenavigated event fires on this page.
  const navigations: string[] = [];
  other.on("framenavigated", (frame) => {
    if (frame === other.mainFrame()) navigations.push(frame.url());
  });
  const [response] = await Promise.all([
    other.waitForResponse((res) => res.request().method() === "POST"),
    other.getByRole("button", { name: "Publish", exact: true }).click(),
  ]);
  expect(response.status()).toBe(409);
  expect(navigations).toEqual([]);

  // The editor keeps the typed value and reports the conflict: the URL is
  // still the editor route, the alert names the conflict, and the Title
  // field still holds the marker typed in the second page.
  await expect(other).toHaveURL(new RegExp(`/admin/${id}/edit`));
  await expect(other.getByRole("alert")).toContainText(
    PUBLISH_CONFLICT_MESSAGE,
  );
  await expect(other.getByLabel("Title")).toHaveValue(secondTabTitle);
});

test("Publish keeps the body it validated when a draft save lands in the same window", async ({
  page,
}) => {
  // Publish writes the validated title, body and excerpt in one guarded
  // UPDATE, so a draft save sent at the same instant cannot replace the
  // published body: whichever order the two writes land in, the published
  // columns end holding the body the publish request carried.
  // The marker is digits only: the slug field accepts lowercase letters,
  // numbers and single hyphens, so a marker with a space would be normalised
  // by the app and the test's own address would not match the stored one.
  const marker = String(Date.now() % 1000000);
  const title = `Atomic publish ${marker}`;
  const slug = `atomic-publish-${marker}`;
  const excerpt = `Atomic publish excerpt ${marker}.`;

  await login(page);
  await page.goto("/admin/new");
  await fillPostForm(page, {
    title,
    slug,
    body: `Attached draft ${marker}.`,
    excerpt,
  });
  await saveDraft(page);
  const id = editPostId(page);

  const saveForm = {
    intent: "save-draft",
    title,
    slug,
    excerpt,
    redirectTo: `/admin/${id}/edit`,
  };

  for (let round = 1; round <= 10; round += 1) {
    const publishedBody = `Published body ${marker} round ${round}.`;

    // Attach a draft through the same endpoint the Save draft button uses.
    const attach = await page.request.post(`/admin/${id}/edit`, {
      form: { ...saveForm, body: `Draft body round ${round} ${marker}.` },
      maxRedirects: 0,
    });
    expect(attach.status(), `attach round ${round}`).toBe(302);

    // The racing pair: publish the validated body, and an empty-body draft
    // save, sent at the same time.
    const [publishResponse, emptySave] = await Promise.all([
      page.request.post(`/admin/${id}/edit`, {
        form: {
          intent: "publish",
          title,
          slug,
          body: publishedBody,
          excerpt,
          redirectTo: `/admin/${id}/edit`,
        },
        maxRedirects: 0,
      }),
      page.request.post(`/admin/${id}/edit`, {
        form: { ...saveForm, body: "" },
        maxRedirects: 0,
      }),
    ]);
    expect(publishResponse.status(), `publish round ${round}`).toBe(302);
    // The draft save is the loser of the race in some rounds, and losing is
    // the designed outcome: the guarded write matches no row and the request
    // is answered with a field message. Either answer is acceptable here, as
    // long as the published body below is the validated one.
    expect([302, 409], `empty save round ${round}`).toContain(emptySave.status());

    // The public post page shows the validated body, never the draft body
    // and never an empty body.
    await page.goto(`/posts/${slug}`);
    await expect(page.getByText(publishedBody)).toBeVisible();
    await expect(page.getByText(`Draft body round ${round}`)).toHaveCount(0);
  }
});
