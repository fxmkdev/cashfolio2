import { Box } from "@mantine/core";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { AccountType } from "@/.prisma-client/enums";
import { createGroupRow, createAccountRow, activeAssetRows } from "./fixtures";
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
export const ActiveHappyPath: Story = {
  render: () => <AccountsPageStoryHarness initialMode="active" />,
};

export const RouteSmoke: Story = {
  parameters: {
    router: {
      initialPath: "/storybook-book/accounts?tab=BALANCE&mode=active",
    },
  },
  render: () => (
    <AccountsPageStoryHarness initialMode="active" routeSmoke={true} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      canvas.queryByRole("link", { name: "Archive" }),
    ).not.toBeInTheDocument();
    expect(
      canvas.getByRole("heading", { name: "Accounts" }),
    ).toBeInTheDocument();
    expect(canvas.queryByRole("tablist")).not.toBeInTheDocument();
    await expect(canvas.getByTestId("router-search")).toHaveTextContent(
      '"tab":"BALANCE"',
    );
    await expect(canvas.getByTestId("router-search")).toHaveTextContent(
      '"mode":"active"',
    );
  },
};

export const MixedBalanceHierarchy: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      expandGroups
      rowsOverride={[
        {
          ...createGroupRow({
            id: "banking",
            name: "Banking",
            type: AccountType.BALANCE,
            isActive: true,
            sortOrder: 0,
          }),
          balanceInReferenceCurrency: 40,
        },
        createAccountRow({
          id: "bank",
          name: "Bank Balance",
          groupId: "banking",
          type: AccountType.BALANCE,
          isActive: true,
          sortOrder: 0,
          currency: "CHF",
          balance: 100,
          balanceInReferenceCurrency: 100,
        }),
        createAccountRow({
          id: "credit",
          name: "Credit Balance",
          groupId: "banking",
          type: AccountType.BALANCE,
          isActive: true,
          sortOrder: 1,
          currency: "CHF",
          balance: -60,
          balanceInReferenceCurrency: -60,
        }),
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.queryByRole("tablist")).not.toBeInTheDocument();
    await expect(
      canvas.findByText("Bank Balance", { exact: true }),
    ).resolves.toBeVisible();
    await expect(
      canvas.findByText("Credit Balance", { exact: true }),
    ).resolves.toBeVisible();
    expect(
      canvasElement.querySelector(
        '[row-id="banking"] [col-id="balanceInReferenceCurrency"]',
      ),
    ).toHaveTextContent("40.00");
  },
};

export const ConstrainedWidthWithGainLoss: Story = {
  render: () => (
    <Box w={960} maw="100%">
      <AccountsPageStoryHarness
        initialMode="active"
        expandGroups
        rowsOverride={activeAssetRows.map((row) => ({
          ...row,
          name:
            row.id === "group-cash"
              ? "Cash and savings accounts"
              : row.id === "account-checking"
                ? "Household current account"
                : row.id === "account-holding"
                  ? "US dollar investment holdings"
                  : row.name,
        }))}
      />
    </Box>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nameHeader = await canvas.findByRole("columnheader", {
      name: "Name",
    });
    await waitFor(() => {
      expect(nameHeader.getBoundingClientRect().width).toBeGreaterThanOrEqual(
        320,
      );
      expect(canvas.getByText("Household current account")).toBeVisible();
    });
    const resizeHandle = nameHeader.querySelector<HTMLElement>(
      ".ag-header-cell-resize",
    );
    if (!resizeHandle) throw new Error("Missing Name column resize handle");
    const bounds = resizeHandle.getBoundingClientRect();
    const startX = bounds.left + bounds.width / 2;
    const clientY = bounds.top + bounds.height / 2;
    await userEvent.pointer([
      {
        target: resizeHandle,
        coords: { clientX: startX, clientY },
        keys: "[MouseLeft>]",
      },
      { target: resizeHandle, coords: { clientX: startX + 100, clientY } },
      { keys: "[/MouseLeft]" },
    ]);
    await waitFor(() =>
      expect(nameHeader.getBoundingClientRect().width).toBe(420),
    );
    const viewport = canvasElement.querySelector(".ag-grid-viewport");
    if (!viewport) throw new Error("Could not resolve Accounts viewport");
    expect(viewport.scrollWidth).toBeGreaterThan(viewport.clientWidth);
    const nameCell = canvas
      .getByText("Household current account")
      .closest<HTMLElement>(".ag-cell");
    const accountRow = nameCell?.closest<HTMLElement>(".ag-row");
    const actionsCell =
      accountRow?.querySelector<HTMLElement>('[col-id="actions"]');
    if (!nameCell || !accountRow || !actionsCell)
      throw new Error("Could not resolve account name and actions cells");
    const initialNameLeft = nameCell.getBoundingClientRect().left;
    const initialActionsRight = actionsCell.getBoundingClientRect().right;
    expect(initialNameLeft).toBeGreaterThanOrEqual(
      viewport.getBoundingClientRect().left,
    );
    expect(initialActionsRight).toBeLessThanOrEqual(
      viewport.getBoundingClientRect().right,
    );
    viewport.scrollLeft = viewport.scrollWidth;
    await waitFor(() => {
      expect(viewport.scrollLeft).toBeGreaterThan(0);
      expect(nameCell.getBoundingClientRect().left).toBeCloseTo(
        initialNameLeft,
        0,
      );
      expect(actionsCell.getBoundingClientRect().right).toBeCloseTo(
        initialActionsRight,
        0,
      );
      expect(canvas.getByText("Household current account")).toBeVisible();
      expect(
        canvas.getByRole("columnheader", { name: "Unrealised" }),
      ).toBeVisible();
    });
    await userEvent.hover(nameCell);
    await waitFor(() => expect(actionsCell).toHaveStyle({ opacity: "1" }));
    await userEvent.click(
      within(accountRow).getByRole("button", { name: "Edit" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const editDialog = await findVisibleDialog(body, "Edit Account");
    expect(nameHeader.getBoundingClientRect().width).toBe(420);
    await userEvent.click(
      within(editDialog).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => expect(editDialog).not.toBeInTheDocument());
    expect(nameHeader.getBoundingClientRect().width).toBe(420);
    const groupRow = canvas
      .getByText("Cash and savings accounts")
      .closest<HTMLElement>(".ag-row");
    const collapse = groupRow?.querySelector<HTMLElement>(".ag-group-expanded");
    if (!groupRow || !collapse) throw new Error("Missing Cash group expander");
    await userEvent.click(collapse);
    await waitFor(() =>
      expect(
        canvas.queryByText("Household current account"),
      ).not.toBeInTheDocument(),
    );
    const expand = groupRow.querySelector<HTMLElement>(".ag-group-contracted");
    if (!expand) throw new Error("Missing Cash group expander");
    await userEvent.click(expand);
    await waitFor(() =>
      expect(canvas.getByText("Household current account")).toBeVisible(),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Show Gain/Loss Details" }),
    );
    const details = await within(canvasElement.ownerDocument.body).findByRole(
      "dialog",
      { name: "Gain/Loss Details" },
    );
    await waitFor(() => {
      const bounds = details.getBoundingClientRect();
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(
        canvasElement.ownerDocument.documentElement.clientWidth,
      );
    });
    await userEvent.keyboard("{Escape}");
    viewport.scrollLeft = 0;
  },
};
