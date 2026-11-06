import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box } from "@mantine/core";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { Unit } from "@/.prisma-client/enums";
import { DataGrid } from "@/components/grid/data-grid";
import { rowActionsColumnProps } from "@/components/grid/row-actions-menu";
import { OPENING_BALANCES_MANAGEMENT_MESSAGE } from "@/shared/opening-balances";
import { LedgerActionsCell } from "./actions-cell";
import type { LedgerRow } from "./page-types";

const row: LedgerRow = {
  id: "booking",
  transactionId: "transaction",
  description: "Coffee",
  date: "2026-01-10",
  counterpartyAccounts: [],
  bookingValue: -5,
  unit: Unit.CURRENCY,
  currency: "CHF",
  cryptocurrency: null,
  symbol: null,
  tradeCurrency: null,
  debit: null,
  credit: 5,
  referenceDebit: null,
  referenceCredit: 5,
  balance: 100,
  isOpeningBalancesTransaction: false,
  isVirtualCarryOver: false,
};

const meta = {
  title: "Components/LedgerActionsCell",
  component: LedgerActionsCell,
  args: {
    row,
    onEditClick: fn(),
    onCopyClick: fn(),
    onRebookClick: fn(),
    onDeleteClick: fn(),
  },
  render: (args) => (
    <Box h={260} w={500}>
      <DataGrid
        rowData={[
          args.row,
          {
            ...args.row,
            id: "opening",
            description: "Opening Balances",
            isOpeningBalancesTransaction: true,
          },
          {
            ...args.row,
            id: "carry",
            description: "Carry Over",
            isVirtualCarryOver: true,
          },
        ]}
        getRowId={({ data }) => data.id}
        rowSelection={{
          mode: "singleRow",
          checkboxes: false,
          enableClickSelection: true,
        }}
        columnDefs={[
          { field: "description", width: 600 },
          {
            colId: "actions",
            ...rowActionsColumnProps,
            width: 88,
            minWidth: 88,
            maxWidth: 88,
            pinned: "right",
            cellRenderer: ({ data }: { data: LedgerRow }) => (
              <LedgerActionsCell {...args} row={data} />
            ),
          },
        ]}
      />
    </Box>
  ),
} satisfies Meta<typeof LedgerActionsCell>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Actions: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = await canvas.findByRole("button", {
      name: "More Actions for Coffee",
    });
    const cell = trigger.closest<HTMLElement>(".ag-cell")!;
    const gridRow = trigger.closest<HTMLElement>(".ag-row")!;
    await userEvent.hover(gridRow);
    const cellBounds = cell.getBoundingClientRect();
    await expect(cellBounds.width).toBe(88);
    for (const button of within(gridRow).getAllByRole("button")) {
      const bounds = button.getBoundingClientRect();
      await expect(bounds.width).toBe(32);
      await expect(bounds.left).toBeGreaterThanOrEqual(cellBounds.left);
      await expect(bounds.right).toBeLessThanOrEqual(cellBounds.right);
    }
    await userEvent.click(
      within(gridRow).getByRole("button", { name: "Edit" }),
    );
    await expect(args.onEditClick).toHaveBeenCalledWith("transaction");
    for (const name of ["Copy", "Rebook", "Delete"]) {
      await userEvent.click(trigger);
      await expect(
        body.queryByRole("menuitem", { name: "Edit" }),
      ).not.toBeInTheDocument();
      const item = await body.findByRole("menuitem", { name });
      await expect(canvasElement.contains(item)).toBe(false);
      await userEvent.unhover(gridRow);
      await waitFor(() => expect(getComputedStyle(cell).opacity).toBe("1"));
      const bounds = item.closest("[role=menu]")!.getBoundingClientRect();
      await expect(bounds.right).toBeLessThanOrEqual(window.innerWidth);
      await expect(bounds.left).toBeGreaterThanOrEqual(0);
      await userEvent.click(item);
    }
    await expect(args.onCopyClick).toHaveBeenCalledWith("transaction");
    await expect(args.onRebookClick).toHaveBeenCalledWith({
      bookingId: "booking",
      transactionId: "transaction",
      bookingValue: -5,
      bookingUnit: {
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
      },
    });
    await expect(args.onDeleteClick).toHaveBeenCalledWith(
      "transaction",
      "Coffee",
    );
    await expect(gridRow).not.toHaveAttribute("aria-selected", "true");
    const carry = canvasElement.querySelector('.ag-row[row-id="carry"]')!;
    await expect(
      within(carry as HTMLElement).queryByRole("button"),
    ).not.toBeInTheDocument();
  },
};

export const KeyboardAndReveal: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = await canvas.findByRole("button", {
      name: "More Actions for Coffee",
    });
    const cell = trigger.closest<HTMLElement>(".ag-cell")!;
    const gridRow = trigger.closest<HTMLElement>(".ag-row")!;
    await userEvent.unhover(gridRow);
    await waitFor(() => expect(getComputedStyle(cell).opacity).toBe("0"));
    const description = gridRow.querySelector<HTMLElement>(
      '[col-id="description"]',
    )!;
    await userEvent.click(description);
    await userEvent.unhover(gridRow);
    await waitFor(() => expect(getComputedStyle(cell).opacity).toBe("1"));
    await userEvent.keyboard("{ArrowRight}{Tab}");
    await expect(
      within(gridRow).getByRole("button", { name: "Edit" }),
    ).toHaveFocus();
    await userEvent.keyboard("{Tab}");
    await expect(trigger).toHaveFocus();
    await userEvent.keyboard(" ");
    await body.findByRole("menu");
    await userEvent.keyboard("{ArrowDown}");
    await expect(body.getByRole("menuitem", { name: "Copy" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect(body.getByRole("menuitem", { name: "Rebook" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(body.getByRole("menu")).toBeVisible());
  },
};

export const OpeningBalances: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = await canvas.findByRole("button", {
      name: "More Actions for Opening Balances",
    });
    const gridRow = trigger.closest<HTMLElement>(".ag-row")!;
    await userEvent.hover(gridRow);
    await expect(
      within(gridRow).getByRole("button", { name: "Edit" }),
    ).toBeDisabled();
    await userEvent.click(trigger);
    for (const name of ["Copy", "Rebook", "Delete"]) {
      const item = await body.findByRole("menuitem", { name });
      await expect(item).toBeDisabled();
      await expect(item).toHaveAccessibleDescription(
        OPENING_BALANCES_MANAGEMENT_MESSAGE,
      );
    }
    await expect(args.onCopyClick).not.toHaveBeenCalled();
  },
};
