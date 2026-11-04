// scripts/owner-reset.ts exports hashPassword and passwordLengthError and does
// no database work at import time (its main() runs only when executed
// directly), so this file imports both in a node environment with no
// DATABASE_URL, no database, and no files created. It asserts that the
// script's hash matches the shared format scrypt$16384$8$1$<salt>$<hash> and
// round-trips against verifyPassword in app/lib/password.ts, and that the
// script's 12-to-200 length verdict equals validatePassword's verdict from
// app/lib/validation.ts at the boundary lengths 11, 12, 200, and 201. The
// verdict is the valid/invalid decision, not the message text, because the
// two modules intentionally use different message wording.

import { hashPassword, passwordLengthError } from "../../scripts/owner-reset";
import { verifyPassword } from "../../app/lib/password";
import { validatePassword } from "../../app/lib/validation";
import { expect, test } from "vitest";

const PASSWORD_12 = "a".repeat(12);
const PASSWORD_200 = "a".repeat(200);

test("hashPassword produces the scrypt$16384$8$1$<salt>$<hash> format", () => {
  expect(hashPassword(PASSWORD_12)).toMatch(
    /^scrypt\$16384\$8\$1\$[^$]+\$[^$]+$/,
  );
});

test("verifyPassword accepts the script's hash for a 12-character password", () => {
  expect(verifyPassword(PASSWORD_12, hashPassword(PASSWORD_12))).toBe(true);
});

test("verifyPassword accepts the script's hash for a 200-character password", () => {
  expect(verifyPassword(PASSWORD_200, hashPassword(PASSWORD_200))).toBe(true);
});

test("verifyPassword rejects a wrong password against the script's hash", () => {
  const hash = hashPassword(PASSWORD_12);
  expect(verifyPassword("b".repeat(12), hash)).toBe(false);
});

for (const length of [11, 12, 200, 201]) {
  test(`the script's length verdict equals validatePassword's at ${length} characters`, () => {
    const password = "a".repeat(length);
    expect(passwordLengthError(password) === null).toBe(
      validatePassword(password) === null,
    );
  });
}

test("the length verdicts are invalid below 12 and above 200, valid at the bounds", () => {
  expect(passwordLengthError("a".repeat(11))).not.toBeNull();
  expect(passwordLengthError(PASSWORD_12)).toBeNull();
  expect(passwordLengthError(PASSWORD_200)).toBeNull();
  expect(passwordLengthError("a".repeat(201))).not.toBeNull();
});
