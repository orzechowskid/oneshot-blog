// The browser dialog itself is not observable under Playwright: Chromium
// under Playwright suppresses the beforeunload dialog, so the reload and
// tab-close prompts cannot be asserted in the integration suite.
//
// Measured limit: app/components/PostForm.tsx exposes no exportable hook
// for the unsaved-changes warning. The registration and removal live in an
// inline useEffect inside the PostForm component function, which cannot be
// called from a node-environment test (it uses React hooks and needs a
// renderer). What this file asserts: the module loads in node, PostForm is
// exported as a function, and the source registers the warning only while
// the form is dirty and removes it in cleanup. What is not reachable: the
// runtime effect itself (the actual addEventListener/removeEventListener
// calls on window), which needs jsdom or a browser; this repo's vitest
// runs environment "node", with no jsdom and no testing-library.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as postForm from "../../app/components/PostForm";
import { expect, test } from "vitest";

const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../app/components/PostForm.tsx"),
  "utf8",
);

test("PostForm loads in a node environment and is exported as a function", () => {
  expect(typeof postForm.PostForm).toBe("function");
});

test("the unsaved-changes warning is registered only while the form is dirty", () => {
  // The effect body returns before registering when the form is clean.
  expect(source).toContain("if (!dirty) return;");
  // The handler opts the page into the browser warning.
  expect(source).toContain("event.preventDefault();");
  expect(source).toContain('event.returnValue = "";');
  // The handler is registered on beforeunload.
  expect(source).toContain(
    'window.addEventListener("beforeunload", handleBeforeUnload);',
  );
  // The effect re-runs when the dirty state changes.
  expect(source).toContain("}, [dirty]);");
});

test("the unsaved-changes warning is removed when the form becomes clean", () => {
  // The effect cleanup removes the handler.
  expect(source).toContain(
    'return () => window.removeEventListener("beforeunload", handleBeforeUnload);',
  );
});

test("the dirty state compares every field against the last saved values", () => {
  expect(source).toContain("title !== savedValues.title");
  expect(source).toContain("slug !== savedValues.slug");
  expect(source).toContain("body !== savedValues.body");
  expect(source).toContain("excerpt !== savedValues.excerpt");
});
