import { describe, expect, it } from "vitest";
import { formatDate, toIsoString } from "./format";

describe("formatDate", () => {
  it("formats a date in UTC", () => {
    expect(formatDate("2026-01-02T03:04:05Z")).toBe("January 2, 2026");
  });

  it("returns an empty string for invalid dates", () => {
    expect(formatDate("not a date")).toBe("");
  });
});

describe("toIsoString", () => {
  it("returns an ISO timestamp", () => {
    expect(toIsoString("2026-01-02T03:04:05Z")).toBe(
      "2026-01-02T03:04:05.000Z",
    );
  });

  it("returns an empty string for invalid dates", () => {
    expect(toIsoString("not a date")).toBe("");
  });
});
