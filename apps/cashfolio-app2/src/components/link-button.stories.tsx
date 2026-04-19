import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { IconCalendarMonth } from "@tabler/icons-react";
import { LinkButton } from "./link-button";

const meta = {
  title: "Components/LinkButton",
  component: LinkButton,
  args: {
    children: "Open Accounts",
    variant: "default",
    leftSection: <IconCalendarMonth size={16} />,
    to: "/$accountBookId/accounts",
    params: { accountBookId: "storybook-book" } as never,
    search: { tab: "ASSET", mode: "active" } as never,
  },
} satisfies Meta<typeof LinkButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const RendersHref: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole("link", { name: "Open Accounts" });
    await expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("/storybook-book/accounts"),
    );
  },
};
