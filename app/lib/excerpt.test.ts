import { describe, expect, it } from "vitest";
import { makeExcerpt } from "./excerpt";

describe("makeExcerpt", () => {
  it("removes Markdown syntax from the text", () => {
    expect(makeExcerpt("## Heading\n\nSome **bold** text.")).toBe(
      "Heading Some bold text.",
    );
  });

  it("removes images and code blocks", () => {
    expect(
      makeExcerpt("![A cat](/images/1)\n\n```ts\nconst x = 1;\n```\n\nText."),
    ).toBe("Text.");
  });

  it("keeps link text and drops the URL", () => {
    expect(makeExcerpt("Read [the docs](https://example.com).")).toBe(
      "Read the docs.",
    );
  });

  it("shortens long text and adds an ellipsis", () => {
    const excerpt = makeExcerpt("word ".repeat(100), 20);
    expect(excerpt.length).toBeLessThanOrEqual(21);
    expect(excerpt.endsWith("…")).toBe(true);
  });

  it("returns an empty string for empty input", () => {
    expect(makeExcerpt("   ")).toBe("");
  });
});
