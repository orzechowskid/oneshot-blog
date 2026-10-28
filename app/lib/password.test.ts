import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  safeEqualText,
  verifyPassword,
} from "./password";

describe("password hashing", () => {
  it("verifies a password against its hash", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects the wrong password", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("wrong password", hash)).toBe(false);
  });

  it("rejects malformed hashes", () => {
    expect(verifyPassword("password", "not-a-hash")).toBe(false);
    expect(verifyPassword("password", "scrypt$bad")).toBe(false);
  });

  it("produces a different salt each time", () => {
    expect(hashPassword("same password")).not.toBe(hashPassword("same password"));
  });
});

describe("session tokens", () => {
  it("creates a token with enough entropy", () => {
    expect(createSessionToken().length).toBeGreaterThanOrEqual(40);
  });

  it("hashes a token deterministically", () => {
    expect(hashSessionToken("token")).toBe(hashSessionToken("token"));
  });

  it("produces different hashes for different tokens", () => {
    expect(hashSessionToken("token-a")).not.toBe(hashSessionToken("token-b"));
  });
});

describe("safeEqualText", () => {
  it("returns true for equal strings", () => {
    expect(safeEqualText("secret", "secret")).toBe(true);
  });

  it("returns false for different lengths", () => {
    expect(safeEqualText("secret", "secre")).toBe(false);
  });

  it("returns false for different values", () => {
    expect(safeEqualText("secret", "other!")).toBe(false);
  });
});
