import { ACCOUNT_BOOK_BUSY_MESSAGE } from "@/shared/mutation-errors";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { bulkRows, groupSelectionRows } from "./assignment-fixtures";
import {
  findVisibleDialog,
  assetClassCell,
  selectAssignmentAccount,
} from "./interaction-helpers";
import { AccountsPageStoryHarness } from "./harness";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AccountsPageView } from "../-page-view";
const meta: Meta<typeof AccountsPageView> = {
  title: "Routes/AccountsPageView",
  component: AccountsPageView,
};
export default meta;
type Story = StoryObj<typeof meta>;
export const BulkAssetClassSelection: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      bulkAssignment
      expandGroups
      rowsOverride={bulkRows}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await selectAssignmentAccount(canvasElement, "account-checking");
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "1 account selected",
    );
    const toolbar = within(
      canvas.getByRole("toolbar", { name: "Selected Account Actions" }),
    );
    await expect(
      toolbar.getByRole("button", { name: "Set Asset Class" }),
    ).toBeVisible();
    await expect(
      toolbar.getByRole("button", { name: "Clear Selection" }),
    ).toBeVisible();
    await expect(
      toolbar.queryByRole("button", {
        name: "Move Accounts to Group",
      }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Set Asset Class" }),
    );
    const dialog = within(await findVisibleDialog(body, "Set Asset Class"));
    await expect(dialog.getByRole("button", { name: "Apply" })).toBeDisabled();
    await expect(dialog.getByText(/1 account \(0 archived\)/)).toBeVisible();
    await userEvent.click(dialog.getByLabelText("Asset Class"));
    await userEvent.click(body.getByRole("option", { name: "Equities" }));
    await userEvent.click(dialog.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(
        body.queryByRole("dialog", { name: "Set Asset Class" }),
      ).not.toBeInTheDocument(),
    );
    await expect(
      canvas.queryByRole("toolbar", { name: "Selected Account Actions" }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByTestId("assignment-refreshes")).toHaveTextContent(
      "invalidations: 1",
    );
    await expect(
      canvasElement.querySelector(
        '[row-id="account-checking"] [col-id="assetClass"]',
      ),
    ).toHaveTextContent("Equities");
  },
};

export const BulkAssetClassFilteredSelection: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      bulkAssignment
      expandGroups
      rowsOverride={bulkRows}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(
        canvasElement.querySelector(".ag-header-select-all input"),
      ).not.toBeNull(),
    );
    await userEvent.click(
      canvasElement.querySelector(".ag-header-select-all input")!,
    );
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "2 accounts selected",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Filter to Checking" }),
    );
    await waitFor(() =>
      expect(canvas.getByRole("status")).toHaveTextContent(
        "1 account selected",
      ),
    );
    await expect(assetClassCell(canvasElement, "portfolio")).toHaveTextContent(
      "Mixed",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear Selection" }),
    );
    await userEvent.click(
      canvasElement.querySelector(".ag-header-select-all input")!,
    );
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "1 account selected",
    );
  },
};

export const GroupAssetClassRetry: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      bulkAssignment
      assignmentFailsOnce
      rowsOverride={bulkRows}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await selectAssignmentAccount(canvasElement, "portfolio");
    await userEvent.click(
      canvas.getByRole("button", { name: "Set Asset Class" }),
    );
    const dialog = within(await findVisibleDialog(body, "Set Asset Class"));
    await expect(dialog.getByText(/2 accounts \(1 archived\)/)).toBeVisible();
    await userEvent.click(dialog.getByLabelText("Asset Class"));
    await userEvent.click(body.getByRole("option", { name: "Unclassified" }));
    await userEvent.click(dialog.getByRole("button", { name: "Apply" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      ACCOUNT_BOOK_BUSY_MESSAGE,
    );
    await expect(dialog.getByLabelText("Asset Class")).toHaveValue(
      "Unclassified",
    );
    await expect(canvas.getByTestId("assignment-refreshes")).toHaveTextContent(
      "Refreshes: 1; invalidations: 0",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Try Again" }));
    await waitFor(() =>
      expect(
        body.queryByRole("dialog", { name: "Set Asset Class" }),
      ).not.toBeInTheDocument(),
    );
    await expect(canvas.getByTestId("assignment-refreshes")).toHaveTextContent(
      "invalidations: 1",
    );
  },
};

export const BulkAssetClassScopeReset: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      bulkAssignment
      expandGroups
      rowsOverride={bulkRows}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await selectAssignmentAccount(canvasElement, "account-checking");
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "1 account selected",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Change Account Book" }),
    );
    await waitFor(() =>
      expect(
        canvas.queryByRole("toolbar", { name: "Selected Account Actions" }),
      ).not.toBeInTheDocument(),
    );
    await expect(
      canvasElement.querySelector(
        '[row-id="account-checking"] .ag-selection-checkbox input',
      ),
    ).not.toBeChecked();
  },
};

export const GroupAssetClassSummaries: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      rowsOverride={groupSelectionRows}
    />
  ),
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(assetClassCell(canvasElement, "portfolio")).toHaveTextContent(
        "Mixed",
      ),
    );
    await expect(
      assetClassCell(canvasElement, "other-group"),
    ).toHaveTextContent("Fixed Income");
    await expect(
      assetClassCell(canvasElement, "__archived__:root"),
    ).toHaveTextContent("Digital Assets");
    await expect(assetClassCell(canvasElement, "empty")).toHaveTextContent(
      /^$/,
    );
    await expect(
      canvasElement.querySelector('[row-id="account-checking"]'),
    ).toBeNull();
    await expect(
      canvasElement.querySelector('[row-id="closed-child"]'),
    ).toBeNull();
  },
};
