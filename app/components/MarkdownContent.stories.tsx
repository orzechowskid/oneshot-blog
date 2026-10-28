import type { Meta, StoryObj } from "@storybook/react";
import { MarkdownContent } from "./MarkdownContent";

const meta = {
  title: "Components/MarkdownContent",
  component: MarkdownContent,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof MarkdownContent>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Article: Story = {
  args: {
    html: `
      <h2>A heading</h2>
      <p>Some <strong>bold</strong> text and a <a href="https://example.com" rel="noopener noreferrer">link</a>.</p>
      <table>
        <thead><tr><th>A</th><th>B</th></tr></thead>
        <tbody><tr><td>1</td><td>2</td></tr></tbody>
      </table>
      <pre><code class="language-ts">const x = 1;</code></pre>
    `,
  },
};
