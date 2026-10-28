import type { Meta, StoryObj } from "@storybook/react";
import { TextAreaField, TextField } from "./TextField";

const meta = {
  title: "Components/TextField",
  component: TextField,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof TextField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Email",
    name: "email",
    type: "email",
    autoComplete: "email",
    description: "Use the address you signed up with.",
  },
};

export const Invalid: Story = {
  args: {
    label: "Email",
    name: "email",
    type: "email",
    errorMessage: "Enter a valid email address.",
  },
};

export const TextArea: Story = {
  args: { label: "Body", name: "body" },
  render: () => (
    <TextAreaField
      label="Body"
      name="body"
      description="Write the post in GitHub-Flavored Markdown."
      defaultValue={"## A heading\n\nSome **bold** text."}
    />
  ),
};
