import { expect, userEvent, waitFor, within } from "storybook/test";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AccountsPageView } from "../-page-view";
import { AccountsPageStoryHarness } from "./harness";

const meta: Meta<typeof AccountsPageView> = {
  title: "Routes/AccountsPageView",
  component: AccountsPageView,
};
export default meta;
type Story = StoryObj<typeof meta>;

export const OrganizeEntryAndExit: Story = {
  render: () => (
    <AccountsPageStoryHarness initialMode="active" organize bulkAssignment />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Organize" }));
    await expect(
      await canvas.findByRole("region", { name: "Organize Accounts" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Add Account" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Set Asset Class" }),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Done" }));
    await expect(
      canvas.queryByRole("region", { name: "Organize Accounts" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Add Account" }),
    ).toBeVisible();
  },
};
