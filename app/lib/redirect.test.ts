import { describe, expect, it } from "vitest";
import { safeRedirect } from "./redirect";

describe("safeRedirect", () => {
  it("keeps a local path", () => {
    expect(safeRedirect("/admin")).toBe("/admin");
  });

  it("keeps a local path with a query string", () => {
    expect(safeRedirect("/admin/new?x=1")).toBe("/admin/new?x=1");
  });

  it("rejects absolute URLs", () => {
    expect(safeRedirect("https://example.com")).toBe("/admin");
  });

  it("rejects protocol-relative URLs", () => {
    expect(safeRedirect("//example.com")).toBe("/admin");
  });

  it("rejects backslash paths", () => {
    expect(safeRedirect("/\\example.com")).toBe("/admin");
  });

  it("uses the fallback for empty values", () => {
    expect(safeRedirect(null, "/home")).toBe("/home");
    expect(safeRedirect("", "/home")).toBe("/home");
  });
});
