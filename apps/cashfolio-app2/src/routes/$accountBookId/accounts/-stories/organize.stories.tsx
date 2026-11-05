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

export const OrganizeFromAssetClassGrouping: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      initialGrouping="assetClass"
      organize
      bulkAssignment
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const financialGrid = await canvas.findByRole("treegrid");
    await expect(canvas.getByLabelText("Group By")).toHaveValue("Asset Class");
    await userEvent.click(canvas.getByRole("button", { name: "Organize" }));
    const organizer = within(
      await canvas.findByRole("region", { name: "Organize Accounts" }),
    );
    await expect(
      await organizer.findByText("Investments", { exact: true }),
    ).toBeVisible();
    await expect(canvas.queryByLabelText("Group By")).not.toBeInTheDocument();
    await expect(financialGrid).not.toBeVisible();
    await waitFor(() =>
      expect(organizer.getByRole("button", { name: "Done" })).toBeEnabled(),
    );
    await userEvent.click(organizer.getByRole("button", { name: "Done" }));
    await expect(canvas.getByRole("treegrid")).toBe(financialGrid);
    await expect(financialGrid).toBeVisible();
    await expect(canvas.getByLabelText("Group By")).toHaveValue("Asset Class");
    await expect(
      canvas.getByRole("link", { name: "Manage Asset Classes" }),
    ).toBeVisible();
  },
};
