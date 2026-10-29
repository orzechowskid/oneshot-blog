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
  // The title, address, and excerpts are unique to this test: the public
  // listing also carries posts created by other spec files in the same run.
  const editPath = await createPublishedPost(page, {
    title: "DE published post",
    slug: "de-published-post",
    body: "DE published **stays** live.",
    excerpt: "DE published excerpt.",
  });

  await page.goto(editPath);
  await page.getByLabel("Title").fill("DE draft title");
  await page.getByLabel("Body").fill("DE draft **replaces** nothing.");
  await page.getByLabel("Excerpt").fill("DE draft excerpt.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Post saved.")).toBeVisible();

  // The editor shows the attached draft.
  await expect(page.getByLabel("Title")).toHaveValue("DE draft title");
  await expect(page.getByLabel("Body")).toHaveValue(
    "DE draft **replaces** nothing.",
  );
  await expect(page.getByLabel("Excerpt")).toHaveValue("DE draft excerpt.");

  // The public page still shows the published title and body.
  await page.goto("/posts/de-published-post");
  await expect(
    page.getByRole("heading", { level: 1, name: "DE published post" }),
  ).toBeVisible();
  await expect(page.locator("strong")).toHaveText("stays");
  await expect(page.getByText("replaces")).toHaveCount(0);

  // The public listing still shows the published excerpt for this post,
  // not the draft's. The assertions are scoped to this post's card because
  // the listing also carries the other posts' titles and excerpts.
  await page.goto("/");
  const card = page
    .locator("article")
    .filter({ has: page.getByRole("link", { name: "DE published post" }) });
  await expect(
    card.getByRole("link", { name: "DE published post" }),
  ).toBeVisible();
  await expect(card.getByText("DE published excerpt.")).toBeVisible();
  await expect(page.getByText("DE draft excerpt.")).toHaveCount(0);
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

test("the preview shows the saved published content when the editor opens, before any preview request", async ({ page }) => {
  await login(page);
  const editPath = await createPublishedPost(page, {
    title: "DE first paint post",
    slug: "de-first-paint",
    body: "DE first paint **rendered** on open.",
    excerpt: "DE first paint excerpt.",
  });

  // Block the preview route before the editor loads, so the preview region
  // cannot be filled by a preview response: whatever is shown on first
  // paint came from the server render.
  const previewRequests: string[] = [];
  await page.route("**/admin/preview", (route) => {
    previewRequests.push(route.request().url());
    void route.abort();
  });

  await page.goto(editPath);
  const preview = page.getByLabel("Markdown preview");
  await expect(preview).toBeVisible();
  await expect(preview.getByRole("strong")).toHaveText("rendered");

  // No preview request has run before the first paint shows the content.
  expect(previewRequests).toEqual([]);
});

test("the toolbar buttons and keyboard shortcuts wrap the selected text in the body", async ({ page }) => {
  await login(page);
  const editPath = await createPublishedPost(page, {
    title: "DE toolbar post",
    slug: "de-toolbar",
    body: "DE toolbar base body.",
    excerpt: "DE toolbar excerpt.",
  });

  await page.goto(editPath);
  const body = page.getByLabel("Body");
  const base = "DE toolbar format base here.";

  // The editor re-selects the wrapped text in a requestAnimationFrame
  // after every format. Flush two frames before each new selection, so a
  // stale re-selection from the previous cycle cannot land after this
  // cycle's select-all and move the selection.
  const settleFrames = () =>
    page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => resolve()),
          ),
        ),
    );

  // Selecting all keeps each cycle independent of the previous wrap.
  const selectAll = async () => {
    await settleFrames();
    await body.fill(base);
    await body.press("ControlOrMeta+a");
  };

  // Toolbar buttons wrap the selected text.
  await selectAll();
  await page.getByRole("button", { name: "Bold" }).click();
  await expect(body).toHaveValue(`**${base}**`);

  await selectAll();
  await page.getByRole("button", { name: "Italic" }).click();
  await expect(body).toHaveValue(`*${base}*`);

  await selectAll();
  await page.getByRole("button", { name: "Link" }).click();
  await expect(body).toHaveValue(`[${base}](url)`);

  await selectAll();
  await page.getByRole("button", { name: "Inline code" }).click();
  await expect(body).toHaveValue(`\`${base}\``);

  // The keyboard shortcuts wrap the selected text the same way.
  await selectAll();
  await body.press("ControlOrMeta+b");
  await expect(body).toHaveValue(`**${base}**`);

  await selectAll();
  await body.press("ControlOrMeta+i");
  await expect(body).toHaveValue(`*${base}*`);

  await selectAll();
  await body.press("ControlOrMeta+k");
  await expect(body).toHaveValue(`[${base}](url)`);

  await selectAll();
  await body.press("ControlOrMeta+e");
  await expect(body).toHaveValue(`\`${base}\``);
});

test("in-app navigation with unsaved edits does not warn and the unsaved edits are dropped", async ({ page }) => {
  await login(page);
  const editPath = await createPublishedPost(page, {
    title: "DE nav post",
    slug: "de-nav",
    body: "DE nav base body.",
    excerpt: "DE nav excerpt.",
  });

  await page.goto(editPath);

  let dialogSeen = false;
  page.on("dialog", (dialog) => {
    dialogSeen = true;
    void dialog.dismiss();
  });

  // An unsaved change: the form is dirty, so the reload and tab-close
  // warning is registered while it lives.
  await page.getByLabel("Title").fill("DE nav unsaved title");

  // In-app navigation does not warn and completes.
  await page.getByRole("link", { name: "All posts" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  expect(dialogSeen).toBe(false);

  // The unsaved edit is dropped: the list still shows the stored title.
  await expect(page.getByRole("row", { name: /DE nav post/ })).toBeVisible();
  await expect(page.getByText("DE nav unsaved title")).toHaveCount(0);
});

test("a draft-only post keeps its address when a later draft saves with the same address and gets a numeric suffix", async ({ page }) => {
  await login(page);

  // The first post is a draft-only post that takes the address.
  await page.goto("/admin/new");
  await page.getByLabel("Title").fill("DE draft owner post");
  await page.getByLabel("Slug").fill("de-draft-collision");
  await page.getByLabel("Body").fill("DE draft owner body.");
  await page.getByLabel("Excerpt").fill("DE draft owner excerpt.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Post saved.")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/[0-9a-f-]+\/edit\?saved=1$/);
  const firstEditPath = new URL(page.url()).pathname;

  // A later draft saves with the same address: it is saved under a
  // suffixed address.
  await page.goto("/admin/new");
  await page.getByLabel("Title").fill("DE draft collider post");
  await page.getByLabel("Slug").fill("de-draft-collision");
  await page.getByLabel("Body").fill("DE draft collider body.");
  await page.getByLabel("Excerpt").fill("DE draft collider excerpt.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Post saved.")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/[0-9a-f-]+\/edit\?saved=1$/);
  await expect(page.getByLabel("Slug")).toHaveValue("de-draft-collision-2");

  // The original draft keeps its address.
  await page.goto(firstEditPath);
  await expect(page.getByLabel("Slug")).toHaveValue("de-draft-collision");
});

test("the draft-only editor shows no discard action and keeps the whole-post delete", async ({ page }) => {
  await login(page);

  await page.goto("/admin/new");
  await page.getByLabel("Title").fill("DE no discard draft");
  await page.getByLabel("Slug").fill("de-no-discard");
  await page.getByLabel("Body").fill("DE no discard body.");
  await page.getByLabel("Excerpt").fill("DE no discard excerpt.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Post saved.")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/[0-9a-f-]+\/edit\?saved=1$/);

  // The draft-only editor offers no discard action.
  await expect(page.getByRole("button", { name: "Discard draft" })).toHaveCount(
    0,
  );

  // The whole-post delete is still the removal path.
  await expect(page.getByRole("button", { name: "Delete post" })).toBeVisible();
});
