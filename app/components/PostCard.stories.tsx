import type { Meta, StoryObj } from "@storybook/react";
import { PostCard } from "./PostCard";

const meta = {
  title: "Components/PostCard",
  component: PostCard,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof PostCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Published: Story = {
  args: {
    post: {
      id: "8c6e222e-9074-44cf-bed3-5cd2271fa416",
      slug: "a-short-post",
      title: "A short post",
      excerpt: "A short post about writing in one sitting.",
      status: "published",
      published_at: "2026-01-02T03:04:05Z",
      updated_at: "2026-01-02T03:04:05Z",
    },
  },
};

export const LongTitle: Story = {
  args: {
    post: {
      id: "8c6e222e-9074-44cf-bed3-5cd2271fa417",
      slug: "a-post-with-a-longer-title",
      title: "A post with a longer title that wraps across more than one line",
      excerpt:
        "The card should keep the title readable and the excerpt separate from the date.",
      status: "published",
      published_at: "2026-02-14T10:30:00Z",
      updated_at: "2026-02-14T10:30:00Z",
    },
  },
};
