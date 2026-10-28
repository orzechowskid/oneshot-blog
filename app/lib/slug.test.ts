import { describe, expect, it } from "vitest";
import { slugify, uniqueSlugCandidate } from "./slug";

describe("slugify", () => {
  it("lowercases and joins words with single hyphens", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
  });

  it("removes accents and punctuation", () => {
    expect(slugify("Café au lait")).toBe("cafe-au-lait");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("---Hello---")).toBe("hello");
  });

  it("collapses repeated separators", () => {
    expect(slugify("A  B__C")).toBe("a-b-c");
  });

  it("falls back to a usable slug", () => {
    expect(slugify("!!!")).toBe("post");
  });

  it("limits the slug length", () => {
    expect(slugify("a".repeat(150))).toHaveLength(100);
  });
});

describe("uniqueSlugCandidate", () => {
  it("returns the base slug on the first attempt", () => {
    expect(uniqueSlugCandidate("hello", 1)).toBe("hello");
  });

  it("appends a numeric suffix on later attempts", () => {
    expect(uniqueSlugCandidate("hello", 2)).toBe("hello-2");
  });

  it("keeps the suffix within the length limit", () => {
    const candidate = uniqueSlugCandidate("a".repeat(100), 12);
    expect(candidate.length).toBeLessThanOrEqual(100);
    expect(candidate.endsWith("-12")).toBe(true);
  });
});
