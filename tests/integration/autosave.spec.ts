import { expect, test, type Page } from "@playwright/test";

// The browser dialog that warns about unsaved changes (beforeunload) is
// not observable under Playwright: Chromium under Playwright suppresses
// the dialog, so these tests assert the in-page save-state region
// (role="status"), the error region (role="alert"), and the submit
// controls, not a browser prompt.

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

test("idle autosave on a new post creates one draft-only post, and a later idle save updates the same post", async ({ page }) => {
  await login(page);
  await page.goto("/admin/new");
  await page.getByLabel("Title").fill("Autosave single post");

  // Autosave wait 1 of 2: the idle timer is 3000 ms.
  await page.waitForTimeout(3400);

  // The first autosave created a draft-only post and replaced the browser
  // location with that post's edit route.
  await expect(page).toHaveURL(/\/admin\/[0-9a-f-]+\/edit/);
  const editUrl = page.url();
  await expect(page.getByRole("status")).toHaveText("Saved");

  // A later idle change autosaves again.
  await page.getByLabel("Body").fill("First **autosaved** body.");

  // Autosave wait 2 of 2: the idle timer is 3000 ms.
  await page.waitForTimeout(3400);

  // The location did not move: the same post was updated, not a second one.
  await expect(page).toHaveURL(editUrl);
  await expect(page.getByRole("status")).toHaveText("Saved");

  // The admin list holds exactly one row for this title, in draft state:
  // one draft-only post across both autosaves.
  await page.goto("/admin");
  const rows = page.getByRole("row", { name: /Autosave single post/ });
  await expect(rows).toHaveCount(1);
  await expect(rows.getByText("Draft", { exact: true })).toBeVisible();
});

test("the editor shows saving while a save is in flight, saved after it succeeds, and unsaved after a further change, with the submit controls disabled in flight", async ({ page }) => {
  await login(page);
  // Hold the autosave response so the in-flight window is observable.
  await page.route("**/admin/autosave", (route) => {
    setTimeout(() => {
      void route.continue();
    }, 2000);
  });
  await page.goto("/admin/new");
  await page.getByLabel("Title").fill("Save state post");

  // Autosave wait 1 of 2: the idle timer is 3000 ms; the request then
  // stays in flight for the 2000 ms route delay.
  await page.waitForTimeout(3400);

  const status = page.getByRole("status");
  const saveDraft = page.getByRole("button", { name: "Save draft" });
  const publish = page.getByRole("button", { name: "Publish" });

  // Saving: the request is in flight, and the submit controls are
  // disabled while it is.
  await expect(status).toHaveText("Saving…");
  await expect(saveDraft).toBeDisabled();
  await expect(publish).toBeDisabled();

  // Saved: the delayed response arrived.
  await expect(status).toHaveText("Saved");
  await expect(saveDraft).toBeEnabled();
  await expect(publish).toBeEnabled();

  await page.unroute("**/admin/autosave");

  // Unsaved: a further change.
  await page.getByLabel("Title").fill("Save state post v2");
  await expect(status).toHaveText("Unsaved changes");
});

test("an autosave with an expired session shows the failed-to-save state and keeps the typed text", async ({ page }) => {
  await login(page);
  await page.goto("/admin/new");
  await page.getByLabel("Title").fill("Failed autosave post");
  await page.getByLabel("Body").fill("Text kept after a failed save.");

  // Expire the session before the idle save fires: the autosave request
  // then reaches the route without the session cookie and gets a 401.
  await page.context().clearCookies();

  // Autosave wait 1 of 2: the idle timer is 3000 ms.
  await page.waitForTimeout(3400);

  await expect(page.getByRole("status")).toHaveText("Failed to save");
  await expect(page.getByRole("alert")).toContainText("Not signed in.");

  // The typed text is kept on screen.
  await expect(page.getByLabel("Title")).toHaveValue("Failed autosave post");
  await expect(page.getByLabel("Body")).toHaveValue(
    "Text kept after a failed save.",
  );
});
