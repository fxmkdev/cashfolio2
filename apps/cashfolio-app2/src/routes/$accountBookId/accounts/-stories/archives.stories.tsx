import { expect, userEvent, waitFor, within } from "storybook/test";
import { AccountType } from "@/.prisma-client/enums";
import { createGroupRow, createAccountRow } from "./fixtures";
import { findVisibleDialog } from "./interaction-helpers";
import { AccountsPageStoryHarness } from "./harness";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AccountsPageView } from "../-page-view";
const meta: Meta<typeof AccountsPageView> = {
  title: "Routes/AccountsPageView",
  component: AccountsPageView,
};
export default meta;
type Story = StoryObj<typeof meta>;
export const ArchivedGroups: Story = {
  render: () => <AccountsPageStoryHarness initialMode="archived" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Show Gain/Loss Details" }),
    );
    const details = await within(canvasElement.ownerDocument.body).findByRole(
      "dialog",
      { name: "Gain/Loss Details" },
    );
    expect(details).toHaveTextContent(
      "Totals include active and archived accounts",
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(details).not.toBeVisible());
  },
};

export const ArchivedGroupActions: Story = {
  render: () => <AccountsPageStoryHarness initialMode="archived" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const getWalletRowQueries = async () => {
      const viewport =
        canvasElement.querySelector<HTMLElement>(".ag-grid-viewport");
      if (!viewport)
        throw new Error("Could not resolve the account grid viewport");
      viewport.scrollLeft = 0;
      const walletCell = await canvas.findByText("Wallet", undefined, {
        timeout: 10000,
      });
      const walletRow = walletCell.closest(".ag-row");
      if (!walletRow) throw new Error("Could not resolve Wallet row");
      viewport.scrollLeft = viewport.scrollWidth;
      return within(walletRow as HTMLElement);
    };

    let walletRowQueries = await getWalletRowQueries();
    await userEvent.click(
      await walletRowQueries.findByRole("button", { name: "Edit" }),
    );
    const editDialog = await findVisibleDialog(body, "Edit Account");
    await userEvent.click(
      within(editDialog).getByRole("button", { name: "Save" }),
    );
    await waitFor(() => {
      expect(
        body.queryByRole("dialog", { name: "Edit Account" }),
      ).not.toBeInTheDocument();
    });

    walletRowQueries = await getWalletRowQueries();
    await userEvent.click(
      await walletRowQueries.findByRole("button", { name: "Delete" }),
    );
    const deleteDialog = await findVisibleDialog(body, "Delete Account");
    await userEvent.click(
      within(deleteDialog).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => {
      expect(
        body.queryByRole("dialog", { name: "Delete Account" }),
      ).not.toBeInTheDocument();
    });

    walletRowQueries = await getWalletRowQueries();
    await userEvent.click(
      await walletRowQueries.findByRole("button", {
        name: "Reorder Siblings",
      }),
    );
    const reorderDialog = await findVisibleDialog(body, "Reorder Siblings");
    await userEvent.click(
      within(reorderDialog).getByRole("button", { name: "Close" }),
    );
    await waitFor(() => {
      expect(
        body.queryByRole("dialog", { name: "Reorder Siblings" }),
      ).not.toBeInTheDocument();
    });
  },
};

export const VirtualArchivedAppearance: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      rowsOverride={[
        createGroupRow({
          id: "real-archived",
          name: "Archived",
          type: AccountType.BALANCE,
          isActive: true,
          sortOrder: 0,
        }),
        createAccountRow({
          id: "closed-wallet",
          name: "Closed wallet",
          type: AccountType.BALANCE,
          isActive: false,
          sortOrder: 1,
          currency: "CHF",
          balance: 0,
          balanceInReferenceCurrency: 0,
        }),
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findAllByText("Archived", { exact: true });
    const label = canvasElement.querySelector<HTMLElement>(
      "[data-virtual-archived-label]",
    );
    if (!label) throw new Error("Missing virtual Archived label");
    const row = label.closest<HTMLElement>(".ag-row");
    const cell = label.closest<HTMLElement>(".ag-cell");
    if (!row || !cell) throw new Error("Missing Archived row");
    expect(label.querySelector('svg[aria-hidden="true"]')).toHaveAttribute(
      "width",
      "16",
    );
    expect(
      canvasElement.querySelectorAll("[data-virtual-archived-label]"),
    ).toHaveLength(1);
    const numeric = row.querySelector<HTMLElement>(
      '[col-id="balanceInReferenceCurrency"]',
    );
    if (!numeric) throw new Error("Missing reference balance cell");
    expect(getComputedStyle(label).color).not.toBe(
      getComputedStyle(numeric).color,
    );
    const realLabel = canvasElement.querySelector<HTMLElement>(
      '[row-id="real-archived"] .ag-group-value',
    );
    const chevron = row.querySelector<HTMLElement>(".ag-group-contracted");
    if (!realLabel || !chevron) throw new Error("Missing ordinary tree cells");
    expect(realLabel).toHaveTextContent("Archived");
    expect(realLabel.querySelector("svg")).toBeNull();
    expect(getComputedStyle(realLabel).color).toBe(
      getComputedStyle(numeric).color,
    );
    expect(getComputedStyle(chevron).color).toBe(
      getComputedStyle(numeric).color,
    );
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.hover(label);
    expect(await body.findByRole("tooltip")).toHaveTextContent(
      "Archived items grouped automatically. Included in totals.",
    );
    await userEvent.unhover(label);
    cell.focus();
    await userEvent.tab();
    expect(label).toHaveFocus();
    expect(await body.findByRole("tooltip")).toHaveTextContent(
      "Archived items grouped automatically. Included in totals.",
    );
    await userEvent.tab({ shift: true });
    expect(cell).toHaveFocus();
    const expand = row.querySelector<HTMLElement>(".ag-group-contracted");
    if (!expand) throw new Error("Missing Archived expander");
    await userEvent.click(expand);
    await waitFor(() =>
      expect(canvas.getByText("Closed wallet")).toBeVisible(),
    );
  },
};

export const ArchivedGroupsHaveNoChildCreation: Story = {
  render: () => (
    <AccountsPageStoryHarness initialMode="archived" expandGroups />
  ),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("treegrid");
    await waitFor(() =>
      expect(
        canvasElement.querySelectorAll(".ag-row:not(.ag-opacity-zero)"),
      ).not.toHaveLength(0),
    );
    expect(
      within(canvasElement).queryByRole("button", { name: /^Add Child/ }),
    ).not.toBeInTheDocument();
  },
};
