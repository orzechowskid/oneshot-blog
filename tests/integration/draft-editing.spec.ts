import { expect, test, type Page } from "@playwright/test";

const OWNER_EMAIL = process.env.BOOTSTRAP_EMAIL ?? "owner@example.com";
const OWNER_PASSWORD =
  process.env.BOOTSTRAP_PASSWORD ?? "test-owner-password";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/admin/);
}

// Creates a published post through the new-post form. Returns the edit path
// (/admin/<id>/edit) so tests can open the editor for that post.
async function createPublishedPost(
  page: Page,
  values: { title: string; slug: string; body: string; excerpt: string },
): Promise<string> {
  await page.goto("/admin/new");
  await page.getByLabel("Title").fill(values.title);
  await page.getByLabel("Slug").fill(values.slug);
  await page.getByLabel("Body").fill(values.body);
  await page.getByLabel("Excerpt").fill(values.excerpt);
  await page.getByRole("button", { name: "Publish" }).click();

  await expect(page.getByText("Post saved.")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/[0-9a-f-]+\/edit\?saved=1$/);
  return new URL(page.url()).pathname;
}

test("saving a draft on a published post leaves the public page showing the published title, body, and excerpt while the editor shows the draft", async ({ page }) => {
  await login(page);
  const editPath = await createPublishedPost(page, {
    title: "Published post",
    slug: "published-post",
    body: "Published **stays** live.",
    excerpt: "Published excerpt.",
  });

  await page.goto(editPath);
  await page.getByLabel("Title").fill("Draft title");
  await page.getByLabel("Body").fill("Draft **replaces** nothing.");
  await page.getByLabel("Excerpt").fill("Draft excerpt.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Post saved.")).toBeVisible();

  // The editor shows the attached draft.
  await expect(page.getByLabel("Title")).toHaveValue("Draft title");
  await expect(page.getByLabel("Body")).toHaveValue(
    "Draft **replaces** nothing.",
  );
  await expect(page.getByLabel("Excerpt")).toHaveValue("Draft excerpt.");

  // The public page still shows the published title and body.
  await page.goto("/posts/published-post");
  await expect(
    page.getByRole("heading", { level: 1, name: "Published post" }),
  ).toBeVisible();
  await expect(page.locator("strong")).toHaveText("stays");
  await expect(page.getByText("replaces")).toHaveCount(0);

  // The public listing still shows the published excerpt, not the draft's.
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Published post" })).toBeVisible();
  await expect(page.getByText("Published excerpt.")).toBeVisible();
  await expect(page.getByText("Draft excerpt.")).toHaveCount(0);
});

test("the address control is read-only on a published post", async ({ page }) => {
  await login(page);
  const editPath = await createPublishedPost(page, {
    title: "Read only address post",
    slug: "read-only-address",
    body: "Read only body.",
    excerpt: "Read only excerpt.",
  });

  await page.goto(editPath);
  const slug = page.getByLabel("Slug");
  await expect(slug).toHaveAttribute("readonly", "");
  await expect(slug).toHaveValue("read-only-address");
});

test("a submitted address value on a published post is ignored and the stored address is kept", async ({ page }) => {
  await login(page);
  const editPath = await createPublishedPost(page, {
    title: "Kept address post",
    slug: "kept-address",
    body: "Kept **body** line.",
    excerpt: "Kept excerpt.",
  });

  await page.goto(editPath);
  // Submit a save that carries an address different from the stored one:
  // the read-only control carries no name, so the value is added to the
  // form directly.
  await page.getByLabel("Title").fill("Kept address post v2");
  await page.evaluate(() => {
    const input = document.querySelector('input[name="title"]');
    const form = input ? input.closest("form") : null;
    if (!form) throw new Error("The post form was not found.");
    const hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.name = "slug";
    hidden.value = "hijacked-address";
    form.appendChild(hidden);
  });
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Post saved.")).toBeVisible();

  // The editor still shows the stored address.
  await expect(page.getByLabel("Slug")).toHaveValue("kept-address");

  // The post stays reachable at its original public address.
  await page.goto("/posts/kept-address");
  await expect(
    page.getByRole("heading", { level: 1, name: "Kept address post" }),
  ).toBeVisible();
  await expect(page.locator("strong")).toHaveText("body");

  // The submitted address was not created.
  await page.goto("/posts/hijacked-address");
  await expect(
    page.getByRole("heading", { level: 1, name: "Page not found" }),
  ).toBeVisible();
});

test("an empty body cannot be published and the stored draft survives", async ({ page }) => {
  await login(page);
  const editPath = await createPublishedPost(page, {
    title: "Empty body post",
    slug: "empty-body-post",
    body: "Original body line.",
    excerpt: "Original excerpt.",
  });

  await page.goto(editPath);
  // Attach a draft whose body is empty: draft saves accept an empty body.
  await page.getByLabel("Title").fill("Empty body draft");
  await page.getByLabel("Body").fill("");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Post saved.")).toBeVisible();

  // Publish while the draft body is empty.
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Write the post body in Markdown.",
  );
  // The publish was rejected in place: still on the edit page, no
  // published navigation.
  await expect(page).toHaveURL(/\/admin\/[0-9a-f-]+\/edit/);

  // The stored draft survives the rejected publish.
  await page.goto(editPath);
  await expect(page.getByLabel("Title")).toHaveValue("Empty body draft");
  await expect(page.getByLabel("Body")).toHaveValue("");

  // The public post is unchanged.
  await page.goto("/posts/empty-body-post");
  await expect(
    page.getByRole("heading", { level: 1, name: "Empty body post" }),
  ).toBeVisible();
  await expect(page.getByText("Original body line.")).toBeVisible();
});

test("a publish rejected by a length limit keeps the draft", async ({ page }) => {
  await login(page);
  const editPath = await createPublishedPost(page, {
    title: "Limit post",
    slug: "limit-post",
    body: "Limit body line.",
    excerpt: "Limit excerpt.",
  });

  await page.goto(editPath);
  // Attach a draft first: Publish is unavailable without one.
  await page.getByLabel("Excerpt").fill("Draft excerpt.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Post saved.")).toBeVisible();

  // Publish with an excerpt over the 400-character limit.
  await page.getByLabel("Excerpt").fill("e".repeat(401));
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Excerpts must be 400 characters or fewer.",
  );

  // The draft is still stored with the values from before the failed
  // publish, not the rejected values.
  await page.goto(editPath);
  await expect(page.getByLabel("Excerpt")).toHaveValue("Draft excerpt.");
  await expect(page.getByLabel("Body")).toHaveValue("Limit body line.");
});

test("a second draft save overwrites the first and the editor shows one saved state", async ({ page }) => {
  await login(page);
  const editPath = await createPublishedPost(page, {
    title: "Overwrite post",
    slug: "overwrite-post",
    body: "Original body line.",
    excerpt: "Original excerpt.",
  });

  await page.goto(editPath);
  await page.getByLabel("Title").fill("First draft");
  await page.getByLabel("Body").fill("First draft body.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Post saved.")).toBeVisible();

  await page.getByLabel("Title").fill("Second draft");
  await page.getByLabel("Body").fill("Second draft body.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Post saved.")).toBeVisible();

  // The editor shows the second draft, and exactly one saved state.
  await expect(page.getByLabel("Title")).toHaveValue("Second draft");
  await expect(page.getByLabel("Body")).toHaveValue("Second draft body.");
  await expect(page.getByRole("status")).toHaveText("Saved");
});

test("Discard draft on a published post clears the draft and the public post stays live", async ({ page }) => {
  await login(page);
  const editPath = await createPublishedPost(page, {
    title: "Discard post",
    slug: "discard-post",
    body: "Discard **stays** live.",
    excerpt: "Discard excerpt.",
  });

  await page.goto(editPath);
  await page.getByLabel("Title").fill("Discard draft title");
  await page.getByLabel("Body").fill("Draft **goes** away.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Post saved.")).toBeVisible();

  await page.getByRole("button", { name: "Discard draft" }).click();
  await expect(page.getByText("Post saved.")).toBeVisible();

  // The editor shows the published content again: the draft is cleared.
  // This currently fails: the field state keeps the discarded draft text
  // after the in-app redirect (see report). Checked before any navigation,
  // because a document reload re-reads the loader and hides the issue.
  await expect(page.getByLabel("Title")).toHaveValue("Discard post");
  await expect(page.getByLabel("Body")).toHaveValue("Discard **stays** live.");

  // The admin list shows the post as published without an attached draft.
  await page.goto("/admin");
  const row = page.getByRole("row", { name: /Discard post/ });
  await expect(row.getByText("Published", { exact: true })).toBeVisible();

  // The public post stays live with its existing content.
  await page.goto("/posts/discard-post");
  await expect(
    page.getByRole("heading", { level: 1, name: "Discard post" }),
  ).toBeVisible();
  await expect(page.locator("strong")).toHaveText("stays");
  await expect(page.getByText("goes")).toHaveCount(0);
});

test("the narrow-screen toggle switches between editing and previewing and keeps the typed body text", async ({ page }) => {
  // Below 64rem (1024px) the editor shows the Edit/Preview tab toggle.
  await page.setViewportSize({ width: 480, height: 900 });
  await login(page);

  await page.goto("/admin/new");
  // No title is typed, so the idle autosave does not fire.
  await page.getByLabel("Body").fill("**Narrow toggle** typed text.");
  await page.getByRole("button", { name: "Preview" }).click();

  const preview = page.getByLabel("Markdown preview");
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("typed text");
  await expect(preview.getByRole("strong")).toHaveText("Narrow toggle");

  // Switching back to editing keeps the typed body text.
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Body")).toHaveValue(
    "**Narrow toggle** typed text.",
  );
});

test("a draft save whose address is taken appends a numeric suffix, saves, and the editor shows the resulting address", async ({ page }) => {
  await login(page);

  // The first post takes the address.
  await page.goto("/admin/new");
  await page.getByLabel("Title").fill("Taken address post");
  await page.getByLabel("Slug").fill("taken-address");
  await page.getByLabel("Body").fill("Taken body.");
  await page.getByLabel("Excerpt").fill("Taken excerpt.");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Post saved.")).toBeVisible();

  // A draft save with the same address.
  await page.goto("/admin/new");
  await page.getByLabel("Title").fill("Colliding draft");
  await page.getByLabel("Slug").fill("taken-address");
  await page.getByLabel("Body").fill("Colliding body.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Post saved.")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/[0-9a-f-]+\/edit\?saved=1$/);

  // The editor shows the resulting suffixed address.
  await expect(page.getByLabel("Slug")).toHaveValue("taken-address-2");

  // The first post still owns the original address.
  await page.goto("/posts/taken-address");
  await expect(
    page.getByRole("heading", { level: 1, name: "Taken address post" }),
  ).toBeVisible();
});

test("a draft save with no title is rejected with a title error and no address error", async ({ page }) => {
  await login(page);

  await page.goto("/admin/new");
  // Only the body is filled; no title, no explicit address.
  await page.getByLabel("Body").fill("A body without a title.");
  await page.getByRole("button", { name: "Save draft" }).click();

  // Rejected with a title error.
  await expect(page.getByRole("alert")).toContainText("Title: Enter a title.");

  // No address error is shown.
  await expect(page.getByText("Enter a slug.")).toHaveCount(0);
  await expect(
    page.getByText("Slugs must be 100 characters or fewer."),
  ).toHaveCount(0);
  await expect(
    page.getByText("Use lowercase letters, numbers, and single hyphens."),
  ).toHaveCount(0);

  // The save was rejected in place, without navigation.
  await expect(page).toHaveURL(/\/admin\/new$/);
});
