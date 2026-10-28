import { describe, expect, it } from "vitest";
import {
  clearCookie,
  parseCookieHeader,
  serializeCookie,
} from "./cookies";

describe("parseCookieHeader", () => {
  it("parses multiple cookies", () => {
    expect(parseCookieHeader("a=1; b=two")).toEqual({ a: "1", b: "two" });
  });

  it("decodes cookie values", () => {
    expect(parseCookieHeader("name=hello%20world")).toEqual({
      name: "hello world",
    });
  });

  it("ignores malformed entries", () => {
    expect(parseCookieHeader("=bad; good=yes; noequals")).toEqual({
      good: "yes",
    });
  });

  it("returns an empty object for no header", () => {
    expect(parseCookieHeader(null)).toEqual({});
  });
});

describe("serializeCookie", () => {
  it("sets secure defaults", () => {
    const cookie = serializeCookie("session", "abc", {
      maxAge: 60,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    });
    expect(cookie).toBe(
      "session=abc; Max-Age=60; Path=/; HttpOnly; Secure; SameSite=Lax",
    );
  });

  it("encodes values", () => {
    expect(serializeCookie("name", "hello world")).toBe(
      "name=hello%20world; HttpOnly",
    );
  });
});

describe("clearCookie", () => {
  it("expires the cookie immediately", () => {
    const cookie = clearCookie("session");
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
  });
});
