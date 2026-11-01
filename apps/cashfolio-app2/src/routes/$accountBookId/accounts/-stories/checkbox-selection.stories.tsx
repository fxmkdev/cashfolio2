import { expect, userEvent, waitFor, within } from "storybook/test";
import { bulkRows, groupSelectionRows } from "./assignment-fixtures";
import {
  findVisibleDialog,
  assetClassCell,
  assignmentCheckbox,
  selectAssignmentAccount,
  expandAssignmentGroup,
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
export const BulkGroupCheckboxSelection: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      bulkAssignment
      rowsOverride={groupSelectionRows}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(() =>
      expect(assignmentCheckbox(canvasElement, "empty")).toBeDisabled(),
    );
    await expect(assetClassCell(canvasElement, "portfolio")).toHaveTextContent(
      "Mixed",
    );
    await userEvent.click(canvas.getByText("Portfolio", { exact: true }));
    await expect(
      canvas.queryByRole("toolbar", { name: "Selected Account Actions" }),
    ).not.toBeInTheDocument();
    await selectAssignmentAccount(canvasElement, "portfolio");
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "2 accounts selected",
    );
    await expect(assignmentCheckbox(canvasElement, "portfolio")).toBeChecked();
    await expect(canvasElement.querySelector('[row-id="old"]')).toBeNull();
    await expandAssignmentGroup(canvasElement, "portfolio");
    await selectAssignmentAccount(canvasElement, "nested");
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "1 account selected",
    );
    await waitFor(() =>
      expect(
        assignmentCheckbox(canvasElement, "portfolio")?.indeterminate,
      ).toBe(true),
    );
    await selectAssignmentAccount(canvasElement, "account-checking");
    await expect(
      canvas.queryByRole("toolbar", { name: "Selected Account Actions" }),
    ).not.toBeInTheDocument();
    await selectAssignmentAccount(canvasElement, "portfolio");
    await selectAssignmentAccount(canvasElement, "other-group");
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "3 accounts selected",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Set Asset Class" }),
    );
    const dialog = within(await findVisibleDialog(body, "Set Asset Class"));
    await expect(dialog.getByText(/3 accounts \(1 archived\)/)).toBeVisible();
    await userEvent.click(dialog.getByLabelText("Asset Class"));
    await userEvent.click(body.getByRole("option", { name: "Equities" }));
    await userEvent.click(dialog.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(canvas.getByTestId("assignment-account-ids")).toHaveTextContent(
        "account-checking,old,other",
      ),
    );
    await waitFor(() =>
      expect(assetClassCell(canvasElement, "portfolio")).toHaveTextContent(
        "Equities",
      ),
    );
    await expect(assetClassCell(canvasElement, "nested")).toHaveTextContent(
      "Equities",
    );
    await expect(
      assetClassCell(canvasElement, "other-group"),
    ).toHaveTextContent("Equities");
    await expect(
      canvas.queryByRole("toolbar", { name: "Selected Account Actions" }),
    ).not.toBeInTheDocument();
  },
};

export const BulkArchivedCheckboxSelection: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      bulkAssignment
      rowsOverride={groupSelectionRows}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await selectAssignmentAccount(canvasElement, "__archived__:root");
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "1 account selected",
    );
    await expect(
      canvasElement.querySelector('[row-id="closed-child"]'),
    ).toBeNull();
    await selectAssignmentAccount(canvasElement, "__archived__:root");
    await expect(
      canvas.queryByRole("toolbar", { name: "Selected Account Actions" }),
    ).not.toBeInTheDocument();
    await expandAssignmentGroup(canvasElement, "__archived__:root");
    await selectAssignmentAccount(canvasElement, "closed");
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "1 account selected",
    );
    await expect(
      assignmentCheckbox(canvasElement, "__archived__:root"),
    ).toBeChecked();
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear Selection" }),
    );
    await expandAssignmentGroup(canvasElement, "portfolio");
    await expandAssignmentGroup(canvasElement, "nested");
    await selectAssignmentAccount(canvasElement, "__archived__:group:nested");
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "1 account selected",
    );
    await waitFor(() =>
      expect(
        assignmentCheckbox(canvasElement, "portfolio")?.indeterminate,
      ).toBe(true),
    );
  },
};

export const BulkFilteredGroupCheckboxSelection: Story = {
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
    await userEvent.click(
      canvas.getByRole("button", { name: "Filter to Checking" }),
    );
    await waitFor(() =>
      expect(canvasElement.querySelector('[row-id="old"]')).toBeNull(),
    );
    await selectAssignmentAccount(canvasElement, "portfolio");
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "1 account selected",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear Account Filters" }),
    );
    await waitFor(() =>
      expect(assignmentCheckbox(canvasElement, "old")).not.toBeNull(),
    );
    await expect(assignmentCheckbox(canvasElement, "old")).not.toBeChecked();
    await waitFor(() =>
      expect(
        assignmentCheckbox(canvasElement, "portfolio")?.indeterminate,
      ).toBe(true),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Set Asset Class" }),
    );
    const dialog = within(await findVisibleDialog(body, "Set Asset Class"));
    await expect(dialog.getByText(/1 account \(0 archived\)/)).toBeVisible();
    await userEvent.click(dialog.getByLabelText("Asset Class"));
    await userEvent.click(body.getByRole("option", { name: "Equities" }));
    await userEvent.click(dialog.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(canvas.getByTestId("assignment-account-ids")).toHaveTextContent(
        "account-checking",
      ),
    );
    await expect(
      canvasElement.querySelector('[row-id="old"] [col-id="assetClass"]'),
    ).toHaveTextContent("Digital Assets");
  },
};
