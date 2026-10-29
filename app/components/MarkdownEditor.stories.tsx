import type { Meta, StoryObj } from "@storybook/react";
import { MarkdownEditor } from "./MarkdownEditor";

const BODY = `## Notes on the editor

Write **bold** text, *italic* text, and [a link](https://example.com).

- First point
- Second point
`;

const BODY_PREVIEW_HTML = `
  <h2>Notes on the editor</h2>
  <p>Write <strong>bold</strong> text, <em>italic</em> text, and <a href="https://example.com" rel="noopener noreferrer">a link</a>.</p>
  <ul>
    <li>First point</li>
    <li>Second point</li>
  </ul>
`;

const LONG_BODY = `## A longer body

Some **bold** text and \`inline code\` in the same paragraph.

\`\`\`ts
function add(a: number, b: number) {
  return a + b;
}
\`\`\`

| Name | Value |
| ---- | ----- |
| One  | 1     |
| Two  | 2     |
`;

const LONG_BODY_PREVIEW_HTML = `
  <h2>A longer body</h2>
  <p>Some <strong>bold</strong> text and <code>inline code</code> in the same paragraph.</p>
  <pre><code class="language-ts">function add(a: number, b: number) {
  return a + b;
}</code></pre>
  <table>
    <thead><tr><th>Name</th><th>Value</th></tr></thead>
    <tbody>
      <tr><td>One</td><td>1</td></tr>
      <tr><td>Two</td><td>2</td></tr>
    </tbody>
  </table>
`;

const meta = {
  title: "Components/MarkdownEditor",
  component: MarkdownEditor,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof MarkdownEditor>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WideScreen: Story = {
  args: {
    label: "Body",
    name: "body",
    value: BODY,
    onBodyChange: () => {},
    initialPreviewHtml: BODY_PREVIEW_HTML,
  },
};

export const NarrowScreen: Story = {
  args: {
    label: "Body",
    name: "body",
    value: BODY,
    onBodyChange: () => {},
    initialPreviewHtml: BODY_PREVIEW_HTML,
  },
};

export const LongBody: Story = {
  args: {
    label: "Body",
    name: "body",
    value: LONG_BODY,
    onBodyChange: () => {},
    initialPreviewHtml: LONG_BODY_PREVIEW_HTML,
  },
};

// The component exposes only the onPreviewFailed callback, not a prop that
// displays a failed state, so this story shows the long body with an empty
// initial preview.
export const EmptyPreview: Story = {
  args: {
    label: "Body",
    name: "body",
    value: LONG_BODY,
    onBodyChange: () => {},
    initialPreviewHtml: "",
  },
};
