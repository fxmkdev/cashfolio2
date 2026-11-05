import { ACCOUNT_BOOK_BUSY_MESSAGE } from "@/shared/mutation-errors";
import { Box } from "@mantine/core";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Unit } from "@/.prisma-client/enums";
import { REFERENCE_CURRENCY_TOTAL_FOOTER_ROW_ID } from "../-page-types";
import {
  bulkRows,
  groupSelectionRows,
  trackingMethodRows,
} from "./assignment-fixtures";
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
export const TrackingMethodColumn: Story = {
  render: () => (
    <Box w={1800}>
      <AccountsPageStoryHarness
        initialMode="active"
        expandGroups
        rowsOverride={groupSelectionRows.map((row) =>
          row.id === "old" || row.id === "closed-child"
            ? { ...row, trackingMethod: "TOTAL_PORTFOLIO_VALUE" }
            : row,
        )}
      />
    </Box>
  ),
  play: async ({ canvasElement }) => {
    const cell = (id: string) =>
      canvasElement.querySelector(`[row-id="${id}"] [col-id="trackingMethod"]`);
    await waitFor(() => expect(cell("portfolio")).toHaveTextContent("Mixed"));
    await expect(cell("account-checking")).toHaveTextContent(
      "Individual Units",
    );
    await expect(cell("old")).toHaveTextContent("Total Value");
    await expect(cell("nested")).toHaveTextContent("Total Value");
    await expect(cell("__archived__:root")).toHaveTextContent("Total Value");
    await expect(cell("other-group")).toHaveTextContent("Individual Units");
    await expect(cell("empty")).toHaveTextContent(/^$/);
    await expect(
      cell(REFERENCE_CURRENCY_TOTAL_FOOTER_ROW_ID),
    ).toHaveTextContent(/^$/);
  },
};

export const BulkTrackingMethodMixedGroupSelection: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      bulkAssignment
      rowsOverride={trackingMethodRows}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await selectAssignmentAccount(canvasElement, "portfolio");
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "4 accounts selected",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Set Tracking Method" }),
    );
    const dialog = within(await findVisibleDialog(body, "Set Tracking Method"));
    await expect(
      dialog.getByText(/Update 2 currency accounts \(1 archived\)/),
    ).toBeVisible();
    await expect(
      dialog.getByText("2 selected non-currency accounts will be skipped."),
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Apply" })).toBeDisabled();
    await userEvent.click(dialog.getByLabelText("Tracking Method"));
    await userEvent.click(body.getByRole("option", { name: "Total Value" }));
    await userEvent.click(dialog.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(
        body.queryByRole("dialog", { name: "Set Tracking Method" }),
      ).not.toBeInTheDocument(),
    );
    await expect(
      canvas.queryByRole("toolbar", { name: "Selected Account Actions" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByTestId("assignment-account-ids"),
    ).toHaveTextContent("account-checking,old");
    await expect(canvas.getByTestId("assignment-refreshes")).toHaveTextContent(
      "invalidations: 1",
    );
    await expect(
      canvasElement.querySelector(
        '[row-id="portfolio"] [col-id="trackingMethod"]',
      ),
    ).toHaveTextContent("Mixed");
  },
};

export const BulkTrackingMethodNoEligibleAccounts: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      bulkAssignment
      expandGroups
      rowsOverride={trackingMethodRows}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await selectAssignmentAccount(canvasElement, Unit.SECURITY);
    await selectAssignmentAccount(canvasElement, Unit.CRYPTOCURRENCY);
    const button = canvas.getByRole("button", { name: "Set Tracking Method" });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAccessibleDescription(
      "Select at least one currency account to set its tracking method.",
    );
    await expect(
      canvas.getByRole("button", { name: "Set Asset Class" }),
    ).toBeEnabled();
    await expect(
      within(canvasElement.ownerDocument.body).queryByRole("dialog", {
        name: "Set Tracking Method",
      }),
    ).not.toBeInTheDocument();
  },
};

export const BulkTrackingMethodFilteredSelection: Story = {
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
    await userEvent.click(
      canvas.getByRole("button", { name: "Set Tracking Method" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await findVisibleDialog(body, "Set Tracking Method"));
    await expect(dialog.getByText(/Update 1 currency account/)).toBeVisible();
    await userEvent.click(dialog.getByLabelText("Tracking Method"));
    await userEvent.click(
      body.getByRole("option", { name: "Individual Units" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(canvas.getByTestId("assignment-account-ids")).toHaveTextContent(
        "account-checking",
      ),
    );
  },
};

export const GroupTrackingMethodRetry: Story = {
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
      canvas.getByRole("button", { name: "Set Tracking Method" }),
    );
    const dialog = within(await findVisibleDialog(body, "Set Tracking Method"));
    await expect(
      dialog.getByText(/2 currency accounts \(1 archived\)/),
    ).toBeVisible();
    await userEvent.click(dialog.getByLabelText("Tracking Method"));
    await userEvent.click(body.getByRole("option", { name: "Total Value" }));
    await userEvent.click(dialog.getByRole("button", { name: "Apply" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      ACCOUNT_BOOK_BUSY_MESSAGE,
    );
    await expect(dialog.getByLabelText("Tracking Method")).toHaveValue(
      "Total Value",
    );
    await expect(canvas.getByTestId("assignment-refreshes")).toHaveTextContent(
      "Refreshes: 1; invalidations: 0",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Try Again" }));
    await waitFor(() =>
      expect(
        body.queryByRole("dialog", { name: "Set Tracking Method" }),
      ).not.toBeInTheDocument(),
    );
    await expect(canvas.getByTestId("assignment-refreshes")).toHaveTextContent(
      "invalidations: 1",
    );
  },
};

export const BulkTrackingMethodScopeReset: Story = {
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
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Set Tracking Method" }),
    );
    await findVisibleDialog(body, "Set Tracking Method");
    await userEvent.click(canvas.getByText("Change Account Book"));
    await waitFor(() =>
      expect(
        canvas.queryByRole("toolbar", { name: "Selected Account Actions" }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        body.queryByRole("dialog", { name: "Set Tracking Method" }),
      ).not.toBeInTheDocument(),
    );
    await expect(
      canvasElement.querySelector(
        '[row-id="account-checking"] .ag-selection-checkbox input',
      ),
    ).not.toBeChecked();
  },
};
