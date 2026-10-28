import type { Meta, StoryObj } from "@storybook/react";
import { FormErrorSummary } from "./FormErrorSummary";

const meta = {
  title: "Components/FormErrorSummary",
  component: FormErrorSummary,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof FormErrorSummary>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Errors: Story = {
  args: {
    errors: {
      title: "Enter a title.",
      body: "Write the post body in Markdown.",
      altText: "Describe the image for screen reader users.",
    },
  },
};
