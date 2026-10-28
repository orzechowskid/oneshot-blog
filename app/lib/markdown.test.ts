import { describe, expect, it } from "vitest";
import { markdownImageSnippet, renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders GitHub-Flavored Markdown tables", () => {
    const html = renderMarkdown("| A | B |\n| - | - |\n| 1 | 2 |");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>A</th>");
    expect(html).toContain("<td>1</td>");
  });

  it("renders task list checkboxes", () => {
    const html = renderMarkdown("- [x] Done\n- [ ] Todo");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
  });

  it("removes scripts", () => {
    const html = renderMarkdown("<script>alert('x')</script>\n\nSafe text");
    expect(html).not.toContain("<script");
    expect(html).toContain("Safe text");
  });

  it("removes javascript links", () => {
    const html = renderMarkdown("[click](javascript:alert('x'))");
    expect(html).not.toContain("javascript:");
  });

  it("adds rel attributes to external links", () => {
    const html = renderMarkdown("[docs](https://example.com)");
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("does not add rel attributes to local links", () => {
    const html = renderMarkdown("[admin](/admin)");
    expect(html).not.toContain("rel=");
  });

  it("adds lazy loading to images", () => {
    const html = renderMarkdown("![A cat](/images/1)");
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('alt="A cat"');
  });

  it("keeps code block classes", () => {
    const html = renderMarkdown("```ts\nconst x = 1;\n```");
    expect(html).toContain('class="language-ts"');
    expect(html).toContain("<pre>");
  });
});

describe("markdownImageSnippet", () => {
  it("builds an image link with sanitized alt text", () => {
    expect(markdownImageSnippet("abc", "A [cat] (sleeping)")).toBe(
      "![A cat sleeping](/images/abc)",
    );
  });
});
