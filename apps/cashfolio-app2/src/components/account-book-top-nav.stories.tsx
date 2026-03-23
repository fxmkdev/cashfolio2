import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { AccountBookTopNav } from "./account-book-top-nav";

const meta = {
  title: "Components/AccountBookTopNav",
  component: AccountBookTopNav,
  args: {
    activeView: "dashboard",
    dashboardHref: "/storybook-book",
    accountsHref: "/storybook-book/accounts?tab=ASSET&mode=active",
  },
} satisfies Meta<typeof AccountBookTopNav>;

export default meta;

type Story = StoryObj<typeof meta>;

export const DashboardActive: Story = {};

export const AccountsActive: Story = {
  args: {
    activeView: "accounts",
  },
};

export const RendersAnchorTabs: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("link", { name: "Dashboard" }),
    ).toHaveAttribute("href", "/storybook-book");
    await expect(
      canvas.getByRole("link", { name: "Accounts" }),
    ).toHaveAttribute("href", "/storybook-book/accounts?tab=ASSET&mode=active");
  },
};
