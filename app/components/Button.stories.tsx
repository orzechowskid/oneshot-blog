import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";

const meta = {
  title: "Components/Button",
  component: Button,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    children: "Save post",
  },
};

export const Variants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
      <Button variant="primary">Save post</Button>
      <Button variant="secondary">Cancel</Button>
      <Button variant="danger">Delete post</Button>
      <Button variant="link">View post</Button>
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    children: "Save post",
    isDisabled: true,
  },
};
