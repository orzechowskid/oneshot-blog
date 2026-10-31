import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const OWNER_EMAIL = process.env.BOOTSTRAP_EMAIL ?? "owner@example.com";
const OWNER_PASSWORD =
  process.env.BOOTSTRAP_PASSWORD ?? "test-owner-password";
const SEED_TOKEN = "integration-test-seed-token";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQAAAABJRU5ErkJggg==",
  "base64",
);

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/admin/);
}

async function expectNoA11yViolations(page: Page, path: string): Promise<void> {
  await page.goto(path);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  expect(
    results.violations,
    `${path} violations:\n${JSON.stringify(results.violations, null, 2)}`,
  ).toEqual([]);
}

test("home page shows the empty state before any posts exist", async ({ page }) => {
  // The database is reset once per run, and the spec files that run
  // before this one (adminlist, autosave) leave posts behind. Delete
  // every row through the admin UI so the test checks the empty state
  // regardless of what they created.
  await login(page);
  const rows = page.locator("tbody > tr");
  const emptyList = page.getByText("No posts yet. Create the first one.");
  for (let guard = 0; guard < 20; guard += 1) {
    await page.goto("/admin");
    if ((await rows.count()) === 0) {
      break;
    }
    // Open the first row's editor and delete the post. The Delete post
    // control submits the delete intent; the app confirms the delete by
    // redirecting to the admin list without the row.
    await rows.first().getByRole("link", { name: "Edit" }).click();
    await page.getByRole("button", { name: "Delete post" }).click();
    await expect(page).toHaveURL(/\/admin$/);
  }
  await expect(emptyList).toBeVisible();

  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "One Shot Blog" }),
  ).toBeVisible();
  await expect(page.getByText("No posts have been published yet.")).toBeVisible();
  await expect(page.locator('a[href^="/posts/"]')).toHaveCount(0);
});

test("the owner can log in and create a published post", async ({ page }) => {
  await login(page);

  await page.goto("/admin/new");
  await page.getByLabel("Title").fill("Integration test post");
  await page.getByLabel("Slug").fill("integration-test-post");
  await page.getByLabel("Body").fill("Hello **integration**.");
  await page.getByLabel("Excerpt").fill("A post from the integration test.");
  await page.getByRole("button", { name: "Publish" }).click();

  await expect(page.getByText("Post saved.")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/[0-9a-f-]+\/edit\?saved=1$/);

  await page.getByRole("link", { name: "View post" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Integration test post" }),
  ).toBeVisible();
  await expect(page.locator("strong")).toHaveText("integration");

  // The admin list shows the new post as published.
  await page.goto("/admin");
  const row = page.getByRole("row", { name: /Integration test post/ });
  await expect(row).toBeVisible();
  await expect(row.getByText("Published", { exact: true })).toBeVisible();
});

test("the owner can save a draft and see it as a draft in the admin list", async ({ page }) => {
  await login(page);

  await page.goto("/admin/new");
  await page.getByLabel("Title").fill("Draft test post");
  await page.getByLabel("Slug").fill("draft-test-post");
  await page.getByLabel("Body").fill("A body for the draft.");
  await page.getByRole("button", { name: "Save draft" }).click();

  await expect(page.getByText("Post saved.")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/[0-9a-f-]+\/edit\?saved=1$/);

  // The admin list shows the post as a draft, with no View control.
  await page.goto("/admin");
  const row = page.getByRole("row", { name: /Draft test post/ });
  await expect(row).toBeVisible();
  await expect(row.getByText("Draft", { exact: true })).toBeVisible();
  await expect(row.getByRole("link", { name: "View" })).toHaveCount(0);

  // A draft-only post is not on the public site.
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Draft test post" }),
  ).toHaveCount(0);
});

test("the owner can upload an image and use it in a post", async ({ page }) => {
  await login(page);

  await page.goto("/admin/new");
  await page.getByLabel("Title").fill("Image post");
  await page.getByLabel("Slug").fill("image-post");
  await page.getByLabel("Body").fill("An image follows.");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Post saved.")).toBeVisible();

  await page.getByLabel("Image file").setInputFiles({
    name: "pixel.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await page.getByLabel("Image description").fill("A black square");
  await page.getByRole("button", { name: "Upload image" }).click();

  await expect(page.getByText("Image uploaded.")).toBeVisible();
  await expect(page.getByRole("img", { name: "A black square" })).toBeVisible();

  const snippet = await page.locator("code").first().textContent();
  expect(snippet).toMatch(/!\[A black square\]\(\/images\/[0-9a-f-]+\)/);

  await page.getByLabel("Body").fill(`An image follows.\n\n${snippet}`);
  // Attach the draft explicitly, then publish it: the published content
  // changes only through the Publish action.
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Post saved.")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Post saved.")).toBeVisible();

  await page.getByRole("link", { name: "View post" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Image post" }),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: "A black square" })).toBeVisible();

  // The owner can delete the uploaded image.
  await page.goto("/admin");
  await page
    .getByRole("row", { name: /Image post/ })
    .getByRole("link", { name: "Edit" })
    .click();
  await page.getByRole("button", { name: "Delete image" }).click();
  await expect(page.getByText("No images uploaded for this post.")).toBeVisible();
});

test("invalid login shows an accessible error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill("wrong password");
  await page.getByRole("button", { name: "Log in" }).click();

  const alert = page.getByRole("alert");
  await expect(alert).toContainText(
    "The email address or password is not correct.",
  );
});

test("pages meet WCAG 2.1 AA automated checks", async ({ page }) => {
  await expectNoA11yViolations(page, "/login");
  await login(page);
  await expectNoA11yViolations(page, "/");
  await expectNoA11yViolations(page, "/admin");
  await expectNoA11yViolations(page, "/admin/new");
  await expectNoA11yViolations(page, "/posts/integration-test-post");
});

test("the seed endpoint rejects a second owner", async ({ request }) => {
  const response = await request.post("/internal/seed", {
    headers: {
      "X-Seed-Token": SEED_TOKEN,
    },
    data: {
      email: "second-owner@example.com",
      password: "another-long-password",
    },
  });

  expect(response.status()).toBe(409);
  expect(await response.text()).toContain("An owner account already exists.");
});

test("the seed endpoint rejects a bad token", async ({ request }) => {
  const response = await request.post("/internal/seed", {
    headers: {
      "X-Seed-Token": "wrong-token",
    },
    data: {
      email: "second-owner@example.com",
      password: "another-long-password",
    },
  });

  expect(response.status()).toBe(403);
});

test("the home page lists the published post", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Integration test post" }),
  ).toBeVisible();
});

test("the owner can delete a post", async ({ page }) => {
  await login(page);
  await page.goto("/admin");

  const row = page.getByRole("row", { name: /Integration test post/ });
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: "Edit" }).click();

  await page.getByRole("button", { name: "Delete post" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(
    page.getByRole("row", { name: /Integration test post/ }),
  ).toHaveCount(0);
});

test("the owner can log out", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Log out" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();

  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { level: 1, name: "Log in" }),
  ).toBeVisible();
});

test("the site header shows New post when logged in and hides it when logged out", async ({
  page,
}) => {
  // Logged out: the header offers Log in and no New post link.
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "New post", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();

  // Logged in: the header offers New post, and it points at the new-post form.
  await login(page);
  await page.goto("/");
  const newPost = page.getByRole("link", { name: "New post", exact: true });
  await expect(newPost).toBeVisible();
  await expect(newPost).toHaveAttribute("href", "/admin/new");

  // The brand link in the top left is the way to the blog list.
  await expect(
    page.getByRole("link", { name: "One Shot Blog", exact: true }),
  ).toHaveAttribute("href", "/");

  // The header link opens the new-post form.
  await newPost.click();
  await expect(page).toHaveURL(/\/admin\/new$/);
});
