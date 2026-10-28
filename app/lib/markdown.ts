import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "img",
  "input",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
];

export function renderMarkdown(markdown: string): string {
  const rendered = marked.parse(markdown, {
    gfm: true,
    breaks: false,
    async: false,
  });

  const html = typeof rendered === "string" ? rendered : String(rendered);

  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "title", "rel"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      code: ["class"],
      input: ["type", "checked", "disabled"],
      li: ["class"],
      th: ["scope", "colspan", "rowspan"],
      td: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: {
      img: ["http", "https"],
    },
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attributes) => {
        const href = attributes.href ?? "";
        const isExternal = /^https?:\/\//i.test(href);
        return {
          tagName,
          attribs: {
            ...attributes,
            ...(isExternal ? { rel: "noopener noreferrer" } : {}),
          },
        };
      },
      img: (tagName, attributes) => {
        return {
          tagName,
          attribs: {
            ...attributes,
            loading: "lazy",
          },
        };
      },
    },
  });
}

export function markdownImageSnippet(id: string, altText: string): string {
  const safeAlt = altText.replace(/[[\]()]/g, " ").replace(/\s+/g, " ").trim();
  return `![${safeAlt}](/images/${id})`;
}
