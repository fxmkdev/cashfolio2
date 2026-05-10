import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { LinkNavLink } from "./link-nav-link";

const meta = {
  title: "Components/LinkNavLink",
  component: LinkNavLink,
  args: {
    label: "Accounts",
    to: "/$accountBookId/accounts",
    params: { accountBookId: "storybook-book" } as never,
    search: { tab: "ASSET", mode: "active" } as never,
  },
} satisfies Meta<typeof LinkNavLink>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Active: Story = {
  args: {
    active: true,
  },
};

export const RendersHref: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole("link", { name: "Accounts" });
    await expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("/storybook-book/accounts"),
    );
  },
};
