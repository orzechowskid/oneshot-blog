import { expect, test, type Page } from "@playwright/test";
import pg from "pg";

const { Client } = pg;

// Measured: Chromium under Playwright emits a dialog of type
// "beforeunload" with an empty message when a reload starts while the
// form is dirty. Dismissing the dialog aborts the navigation, so
// page.reload never resolves and the page stays on the editor with the
// typed text; accepting it lets the reload proceed to the stored saved
// content. The reload test below proves both paths. The tab-close half
// of the warning stays unobservable under Chromium: a closed tab cannot
// be inspected. tests/unit/beforeunload.test.ts is the
// handler-registration substitute: it asserts source text that registers
// the handler only while the form is dirty, not the browser behaviour.
// The other tests here assert the in-page save-state region
// (role="status"), the error region (role="alert"), and the submit
// controls.

const OWNER_EMAIL = process.env.BOOTSTRAP_EMAIL ?? "owner@example.com";
const OWNER_PASSWORD =
  process.env.BOOTSTRAP_PASSWORD ?? "test-owner-password";

// The address base the exhausted-address test occupies with fixture rows:
// base, base-2, ..., base-50.
const EXHAUSTED_ADDRESS_BASE = "exhausted-address-base";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/admin/);
}

test("idle autosave on a new post creates one draft-only post, and later idle and explicit saves update the same post", async ({ page }) => {
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

  // The explicit half: a Save draft click within the idle window stores
  // the explicitly typed body in the same post.
  const explicitBody = "Explicitly **saved** body.";
  await page.getByLabel("Body").fill(explicitBody);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Post saved.")).toBeVisible();

  // The admin list holds exactly one row for this title, in draft state:
  // one draft-only post across both autosaves and the explicit save.
  await page.goto("/admin");
  const rows = page.getByRole("row", { name: /Autosave single post/ });
  await expect(rows).toHaveCount(1);
  await expect(rows.getByText("Draft", { exact: true })).toBeVisible();

  // The row holds the explicitly saved content: the editor for that row
  // shows the explicit body, not the last autosaved one.
  await rows.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByLabel("Title")).toHaveValue("Autosave single post");
  await expect(page.getByLabel("Body")).toHaveValue(explicitBody);
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

test("an autosave rejected by validation answers with the field messages and the editor shows them and keeps the typed text", async ({ page }) => {
  await login(page);

  // Record the autosave answers so the test asserts the response the
  // autosave route returns, not only what the editor renders from it.
  const exchanges: { status: number; body: Record<string, unknown> }[] = [];
  await page.route("**/admin/autosave", async (route) => {
    const response = await route.fetch();
    let body: Record<string, unknown> = {};
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      // A non-JSON answer records an empty body.
    }
    exchanges.push({ status: response.status(), body });
    await route.fulfill({ response });
  });

  // The 201-character title fails the draft-save title limit. The slug is
  // derived from the title and stays valid, so the title error is the only
  // field error.
  const longTitle = "Autosave validation title".padEnd(201, "x");
  const bodyText = "Text kept after a rejected autosave.";
  await page.goto("/admin/new");
  await page.getByLabel("Title").fill(longTitle);
  await page.getByLabel("Body").fill(bodyText);

  // Autosave wait 1 of 1: the idle timer is 3000 ms.
  await page.waitForTimeout(3400);

  // The autosave route answered with the field messages, not a server
  // error.
  const last = exchanges.at(-1);
  expect(last?.status).toBe(400);
  expect(last?.body).toEqual({
    error: "The draft was not saved.",
    fieldErrors: { title: "Titles must be 200 characters or fewer." },
  });

  // The editor shows the field message under the title field and in the
  // form summary, plus the save error.
  await expect(
    page.getByText("Titles must be 200 characters or fewer.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "There is a problem" }),
  ).toContainText("Title: Titles must be 200 characters or fewer.");
  await expect(
    page.getByRole("alert").filter({ hasText: "The draft was not saved." }),
  ).toBeVisible();

  // The draft stays marked unsaved.
  await expect(page.getByRole("status")).toHaveText("Unsaved changes");

  // The typed text is kept on screen.
  await expect(page.getByLabel("Title")).toHaveValue(longTitle);
  await expect(page.getByLabel("Body")).toHaveValue(bodyText);
});

test("reloading with unsaved edits warns, and dismissing keeps the typed text while accepting reloads the editor to the stored content", async ({ page }) => {
  await login(page);

  // Block the idle autosave for this test: it fires three seconds after
  // the typed change and would replace the browser location with the
  // created post's edit route, moving the URL out from under the
  // assertions. The reload warning is registered while the form is
  // dirty, independent of the autosave.
  await page.route("**/admin/autosave", (route) => route.abort());

  await page.goto("/admin/new");

  // An unsaved change: the form is dirty, so the reload warning is
  // registered while it lives.
  const typedTitle = "Reload warning post";
  await page.getByLabel("Title").fill(typedTitle);
  // Let the dirty-state effect register the warning handler before the
  // reload starts.
  await page.waitForTimeout(100);

  // Record every dialog the page emits and answer it per path: dismiss
  // first, accept second. The handler is registered before the reload is
  // triggered, so no dialog is ever left unhandled.
  const dialogs: string[] = [];
  let acceptDialog = false;
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.type());
    if (acceptDialog) {
      void dialog.accept();
    } else {
      void dialog.dismiss();
    }
  });

  // Dismiss path: the warning is shown, and dismissing it aborts the
  // navigation. A dismissed beforeunload leaves the reload pending, so
  // do not await it plainly: give the reload a short timeout and swallow
  // the timeout error.
  await page
    .reload({ timeout: 4000 })
    .catch(() => {
      // Expected: the dismissed dialog aborted the navigation, so the
      // reload never resolves and rejects on timeout.
    });

  // The page is still on the editor and the typed text is intact.
  await expect(page).toHaveURL(/\/admin\/new$/);
  await expect(page.getByLabel("Title")).toHaveValue(typedTitle);
  expect(dialogs).toEqual(["beforeunload"]);

  // Accept path: the warning is shown again, and accepting it lets the
  // reload proceed.
  acceptDialog = true;
  await page.reload();

  // The editor came back with the stored saved content: a new post has
  // nothing stored, so the typed text is gone.
  await expect(page).toHaveURL(/\/admin\/new$/);
  await expect(page.getByLabel("Title")).toHaveValue("");
  expect(dialogs).toEqual(["beforeunload", "beforeunload"]);
});

test("an explicit draft save on a new post that cannot obtain a free address is rejected with an address error and no server error", async ({ page }) => {
  // The 50-attempt collision cap needs base, base-2, ..., base-50 taken.
  // Fifty rows are reachable in a browser test only as database fixture
  // rows: fifty form round trips would exceed the test budget, and the
  // rows must be removed afterwards because blog.spec.ts deletes at most
  // 20 leftover rows before its empty-state test. The fixture rows occupy
  // addresses only; the save under test goes through the editor.
  await login(page);

  const databaseUrl =
    process.env.DATABASE_URL ?? "postgres://blog:blog@127.0.0.1:5432/blog";
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    // Idempotent: also removes a fixture set a failed earlier run left
    // behind.
    await client.query(
      "DELETE FROM posts WHERE slug = $1 OR slug LIKE $1 || '-%'",
      [EXHAUSTED_ADDRESS_BASE],
    );
    await client.query(
      `INSERT INTO posts (slug, title, body_markdown, excerpt, status)
       SELECT $1 || CASE WHEN n = 1 THEN '' ELSE '-' || n END,
              'Exhausted address setup ' || n,
              'Exhausted address setup body.',
              'Exhausted address setup excerpt.',
              'draft'
       FROM generate_series(1, 50) AS n`,
      [EXHAUSTED_ADDRESS_BASE],
    );

    await page.goto("/admin/new");
    await page.getByLabel("Title").fill("Exhausted address post");
    await page.getByLabel("Slug").fill(EXHAUSTED_ADDRESS_BASE);
    await page.getByLabel("Body").fill("Exhausted address body.");

    // The Save draft button is a plain form submission: React Router posts
    // it to the framework submission URL /admin/new.data, which is what the
    // page.on("response") probe shows. Match the pathname, not the page
    // URL, so the matcher hits the submission answer.
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/admin/new.data",
    );
    await page.getByRole("button", { name: "Save draft" }).click();
    const response = await responsePromise;

    // Rejected with a 400 validation answer, not a server error.
    expect(response.status()).toBe(400);

    // The editor shows the address error naming the address the form
    // held, and the form stays on screen with the typed text: no server
    // error page replaces it.
    await expect(
      page.getByRole("alert").filter({ hasText: "There is a problem" }),
    ).toContainText(`Slug: The address '${EXHAUSTED_ADDRESS_BASE}' is taken.`);
    await expect(
      page.getByText(`The address '${EXHAUSTED_ADDRESS_BASE}' is taken.`, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "New post" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/new$/);
    await expect(page.getByLabel("Title")).toHaveValue("Exhausted address post");
    await expect(page.getByLabel("Slug")).toHaveValue(EXHAUSTED_ADDRESS_BASE);
    await expect(page.getByLabel("Body")).toHaveValue("Exhausted address body.");
  } finally {
    // Remove the fixture rows: the later spec files clear at most 20
    // leftover rows before their empty-state test.
    await client.query(
      "DELETE FROM posts WHERE slug = $1 OR slug LIKE $1 || '-%'",
      [EXHAUSTED_ADDRESS_BASE],
    );
    await client.end();
  }
});

test("autosave does not start a second save while the first is in flight", async ({ page }) => {
  // The idle timer is 3000 ms. Delaying every autosave response by 4000 ms
  // puts a later keystroke's timer inside the first request, which is the
  // overlap the guard must prevent. The decisive assertion is that no
  // autosave request after the first is sent without a post id.
  const marker = `overlap ${Date.now() % 1000000}`;
  const autosaveBodies: string[] = [];
  await page.route("**/admin/autosave", async (route) => {
    autosaveBodies.push(route.request().postData() ?? "");
    await new Promise((resolve) => setTimeout(resolve, 4000));
    await route.continue();
  });

  await login(page);
  await page.goto("/admin/new");
  await page.getByLabel("Title").fill(`Autosave overlap ${marker}`);

  // Autosave 1 starts at about 3000 ms and answers at about 7000 ms.
  await page.waitForTimeout(3300);
  await page.getByLabel("Body").fill(`Body typed during the first save ${marker}`);

  await page.waitForResponse(
    (response) => response.url().includes("/admin/autosave"),
    { timeout: 20000 },
  );

  // The next save must reuse the stored id, so it fires after the
  // in-flight save finishes and the idle timer runs out again.
  await expect(page.getByRole("status")).toHaveText("Saved", {
    timeout: 20000,
  });

  // The autosave request body is multipart form data, so the post id field
  // is identified by its part header, not by a query-style "id=" pair.
  const withoutId = autosaveBodies
    .slice(1)
    .filter((body) => !body.includes('name="id"'));
  expect(
    withoutId,
    `autosave requests after the first that carry no id:\n${withoutId.join("\n")}`,
  ).toEqual([]);

  const databaseUrl =
    process.env.DATABASE_URL ?? "postgres://blog:blog@127.0.0.1:5432/blog";
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const rows = await client.query(
      "SELECT slug, status FROM posts WHERE title = $1 ORDER BY slug",
      [`Autosave overlap ${marker}`],
    );
    expect(
      rows.rows,
      `rows created for the title: ${JSON.stringify(rows.rows)}`,
    ).toHaveLength(1);
    expect(rows.rows[0].slug).not.toMatch(/-2$/);
    expect(rows.rows[0].status).toBe("draft");
  } finally {
    await client.end();
  }
});
