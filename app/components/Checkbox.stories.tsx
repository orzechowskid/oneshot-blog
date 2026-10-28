import type { Meta, StoryObj } from "@storybook/react";
import { Checkbox } from "./Checkbox";

const meta = {
  title: "Components/Checkbox",
  component: Checkbox,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Checkbox>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    name: "published",
    value: "yes",
    children: "Publish this post",
  },
};

export const Selected: Story = {
  args: {
    name: "published",
    value: "yes",
    defaultSelected: true,
    children: "Publish this post",
  },
};
