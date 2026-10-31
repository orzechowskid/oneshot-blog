import { expect, test, type Page } from "@playwright/test";

// Admin list scenarios from specs/blog-drafting/spec.md,
// "Admin list shows draft attachment and last change". Times are read
// from the page, not the database: the list renders each time cell as
// <time dateTime={iso}>{date}</time>, so the ISO date in the dateTime
// attribute is parsed and compared as a date. No autosave waits are
// needed: every save here is an explicit button click.

const OWNER_EMAIL = process.env.BOOTSTRAP_EMAIL ?? "owner@example.com";
const OWNER_PASSWORD =
  process.env.BOOTSTRAP_PASSWORD ?? "test-owner-password";

type PostValues = {
  title: string;
  slug: string;
  body: string;
  excerpt: string;
};

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/admin/);
}

// Creates a post through the new-post form with the named control
// ("Publish" or "Save draft"). Returns the edit path (/admin/<id>/edit).
async function createPost(
  page: Page,
  values: PostValues,
  control: "Publish" | "Save draft",
): Promise<string> {
  await page.goto("/admin/new");
  await page.getByLabel("Title").fill(values.title);
  await page.getByLabel("Slug").fill(values.slug);
  await page.getByLabel("Body").fill(values.body);
  await page.getByLabel("Excerpt").fill(values.excerpt);
  await page.getByRole("button", { name: control }).click();

  await expect(page.getByText("Post saved.")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/[0-9a-f-]+\/edit\?saved=1$/);
  return new URL(page.url()).pathname;
}

// Reads the time cell of one list row from the page: the ISO date in the
// dateTime attribute and the visible date text.
async function timeCellOf(page: Page, title: string): Promise<{
  iso: string;
  visible: string;
}> {
  const time = page.getByRole("row", { name: new RegExp(title) }).locator("time");
  const iso = (await time.getAttribute("dateTime")) ?? "";
  const visible = (await time.innerText()).trim();
  return { iso, visible };
}

// Parses a page-rendered ISO date and fails the test when it is not a
// readable date.
function expectReadableDate(iso: string, where: string): number {
  const time = Date.parse(iso);
  expect(
    Number.isNaN(time) ? null : time,
    `${where}: the page did not render a readable date: '${iso}'`,
  ).not.toBeNull();
  return time;
}

// Position of the row whose Title cell holds exactly this title.
async function indexOfRow(page: Page, title: string): Promise<number> {
  const rows = page.locator("tbody > tr");
  const count = await rows.count();
  for (let i = 0; i < count; i += 1) {
    const firstCell = (
      await rows.nth(i).getByRole("cell").first().innerText()
    ).trim();
    if (firstCell === title) return i;
  }
  throw new Error(`No row titled '${title}' in the admin list.`);
}

test("a published post with an attached draft is listed as published with a draft attached and the time cell shows the draft save time", async ({ page }) => {
  await login(page);
  const editPath = await createPost(
    page,
    {
      title: "List published draft",
      slug: "list-published-draft",
      body: "Published **body**.",
      excerpt: "Published excerpt.",
    },
    "Publish",
  );

  // Before the draft: listed as published, time cell is the publication time.
  await page.goto("/admin");
  const row = page.getByRole("row", { name: /List published draft/ });
  await expect(row.getByText("Published", { exact: true })).toBeVisible();
  const publicationTime = expectReadableDate(
    (await timeCellOf(page, "List published draft")).iso,
    "before the draft save",
  );

  // Attach a draft later than the publication.
  await page.goto(editPath);
  await page.getByLabel("Body").fill("Draft **body**.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Post saved.")).toBeVisible();
  await page.waitForTimeout(1200);

  // The row shows the attached-draft state, and the time cell moved past
  // the publication time: it is the draft save time.
  await page.goto("/admin");
  const after = page.getByRole("row", { name: /List published draft/ });
  await expect(
    after.getByText("Published with draft attached", { exact: true }),
  ).toBeVisible();
  const draftTime = expectReadableDate(
    (await timeCellOf(page, "List published draft")).iso,
    "after the draft save",
  );
  expect(draftTime).toBeGreaterThan(publicationTime);
});

test("a draft-only post is listed as a draft and the time cell shows its last save time", async ({ page }) => {
  await login(page);
  const editPath = await createPost(
    page,
    {
      title: "List draft only",
      slug: "list-draft-only",
      body: "First save body.",
      excerpt: "Draft excerpt.",
    },
    "Save draft",
  );

  // The first save is the first last save.
  await page.goto("/admin");
  const row = page.getByRole("row", { name: /List draft only/ });
  await expect(row.getByText("Draft", { exact: true })).toBeVisible();
  const firstSave = expectReadableDate(
    (await timeCellOf(page, "List draft only")).iso,
    "after the first save",
  );

  // A later draft save is the new last save.
  await page.waitForTimeout(1200);
  await page.goto(editPath);
  await page.getByLabel("Body").fill("Second save body.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Post saved.")).toBeVisible();

  // Still a draft, and the time cell moved to the second save.
  await page.goto("/admin");
  const after = page.getByRole("row", { name: /List draft only/ });
  await expect(after.getByText("Draft", { exact: true })).toBeVisible();
  const lastSave = expectReadableDate(
    (await timeCellOf(page, "List draft only")).iso,
    "after the second save",
  );
  expect(lastSave).toBeGreaterThan(firstSave);
});

test("a published post without a draft is listed as published and the time cell shows the last publication time", async ({ page }) => {
  await login(page);
  const started = Date.now();
  await createPost(
    page,
    {
      title: "List published no draft",
      slug: "list-published-no-draft",
      body: "Published **body**.",
      excerpt: "Published excerpt.",
    },
    "Publish",
  );

  await page.goto("/admin");
  const row = page.getByRole("row", { name: /List published no draft/ });
  await expect(row.getByText("Published", { exact: true })).toBeVisible();
  const cell = await timeCellOf(page, "List published no draft");
  const listTime = expectReadableDate(cell.iso, "the list time cell");

  // The public post page shows the publication time; the list shows the
  // same readable date.
  await page.goto("/posts/list-published-no-draft");
  const publicVisible = (await page.locator("time").first().innerText()).trim();
  expect(cell.visible).toBe(publicVisible);

  // The list time is the publication moment of this run, not an older time.
  expect(listTime).toBeGreaterThanOrEqual(started - 5000);
  expect(listTime).toBeLessThanOrEqual(Date.now() + 5000);
});

test("the time column header reads Last change", async ({ page }) => {
  await login(page);
  // A row is needed for the list to render its table.
  await createPost(
    page,
    {
      title: "List header probe",
      slug: "list-header-probe",
      body: "Header probe body.",
      excerpt: "Header probe excerpt.",
    },
    "Save draft",
  );

  await page.goto("/admin");
  await expect(page.getByRole("columnheader", { name: "Last change" })).toBeVisible();
});

test("the View control appears only on published rows", async ({ page }) => {
  await login(page);
  await createPost(
    page,
    {
      title: "List view published",
      slug: "list-view-published",
      body: "Published **body**.",
      excerpt: "Published excerpt.",
    },
    "Publish",
  );
  await createPost(
    page,
    {
      title: "List view draft",
      slug: "list-view-draft",
      body: "Draft body.",
      excerpt: "Draft excerpt.",
    },
    "Save draft",
  );

  await page.goto("/admin");

  // The published row has the View control.
  const publishedRow = page.getByRole("row", { name: /List view published/ });
  await expect(publishedRow.getByRole("link", { name: "View" })).toBeVisible();

  // The draft-only row does not.
  const draftRow = page.getByRole("row", { name: /List view draft/ });
  await expect(draftRow.getByRole("link", { name: "View" })).toHaveCount(0);

  // Across every row: View is present exactly when the row is published,
  // including the published-with-draft-attached state.
  const rows = page.locator("tbody > tr");
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    const row = rows.nth(i);
    const status = (await row.getByRole("cell").nth(1).innerText()).trim();
    const hasView = (await row.getByRole("link", { name: "View" }).count()) > 0;
    const isPublished = status.startsWith("Published");
    expect(hasView, `row ${i} with status '${status}'`).toBe(isPublished);
  }
});

test("saving a draft on a draft-only post moves its row to the position ordered by its new last change time", async ({ page }) => {
  await login(page);
  const firstEdit = await createPost(
    page,
    {
      title: "List move first",
      slug: "list-move-first",
      body: "First post body.",
      excerpt: "First excerpt.",
    },
    "Save draft",
  );
  await page.waitForTimeout(400);
  await createPost(
    page,
    {
      title: "List move second",
      slug: "list-move-second",
      body: "Second post body.",
      excerpt: "Second excerpt.",
    },
    "Save draft",
  );

  // The newer post lists first.
  await page.goto("/admin");
  expect(await indexOfRow(page, "List move second")).toBeLessThan(
    await indexOfRow(page, "List move first"),
  );

  // A draft save on the older post makes its last change the newest.
  await page.waitForTimeout(1200);
  await page.goto(firstEdit);
  await page.getByLabel("Body").fill("First post body, second save.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Post saved.")).toBeVisible();

  // The saved post now lists first.
  await page.goto("/admin");
  expect(await indexOfRow(page, "List move first")).toBeLessThan(
    await indexOfRow(page, "List move second"),
  );
});
