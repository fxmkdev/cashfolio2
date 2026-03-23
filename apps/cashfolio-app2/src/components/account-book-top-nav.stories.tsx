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
    const dashboardTab = canvas.getByRole("tab", { name: "Dashboard" });
    const accountsTab = canvas.getByRole("tab", { name: "Accounts" });

    await expect(dashboardTab).toHaveAttribute("href", "/storybook-book");
    await expect(accountsTab).toHaveAttribute(
      "href",
      "/storybook-book/accounts?tab=ASSET&mode=active",
    );
    await expect(dashboardTab.tagName).toBe("A");
    await expect(accountsTab.tagName).toBe("A");
  },
};
