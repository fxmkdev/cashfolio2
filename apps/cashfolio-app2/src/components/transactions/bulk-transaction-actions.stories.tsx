import { Button, Group, Stack } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import type { GridApi } from "ag-grid-enterprise";
import { useRef, useState } from "react";
import { AccountType, Unit } from "@/.prisma-client/enums";
import { useBulkTransactionActions } from "@/hooks/use-bulk-transaction-actions";
import { DataGrid } from "../grid/data-grid";
import {
  BulkTransactionDialogs,
  BulkTransactionToolbar,
} from "./bulk-transaction-actions";

const booking = {
  bookingValue: 10,
  unit: Unit.CURRENCY,
  currency: "CHF",
  cryptocurrency: null,
  symbol: null,
  tradeCurrency: null,
};
const rows = [
  {
    ...booking,
    id: "b1",
    transactionId: "t1",
    description: "First",
    isOpeningBalancesTransaction: false,
  },
  {
    ...booking,
    id: "b2",
    transactionId: "t1",
    description: "Second",
    isOpeningBalancesTransaction: false,
  },
  {
    ...booking,
    id: "b3",
    transactionId: "t2",
    description: "Third",
    isOpeningBalancesTransaction: false,
  },
  {
    ...booking,
    id: "opening",
    transactionId: "opening",
    description: "Opening Balances",
    isOpeningBalancesTransaction: true,
  },
  {
    ...booking,
    id: "virtual",
    transactionId: "virtual",
    description: "Balance carried forward",
    isOpeningBalancesTransaction: false,
    isVirtualCarryOver: true,
  },
];
const accountOptions = [
  {
    value: "target",
    label: "Savings",
    type: AccountType.ASSET,
    equityAccountSubtype: null,
    unit: Unit.CURRENCY,
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
  },
];

function Harness({
  mode = "ledger",
  incompatible = false,
  deleteTransactions,
  submitRebook,
  invalidate,
  onRefreshConstraints,
}: {
  mode?: "ledger" | "transactions";
  incompatible?: boolean;
  deleteTransactions: (ids: string[]) => Promise<void>;
  submitRebook: (ids: string[], target: string) => Promise<void>;
  invalidate: () => void;
  onRefreshConstraints: () => Promise<void>;
}) {
  const [scopeKey, setScopeKey] = useState("first");
  const [data, setData] = useState(() =>
    rows.map((row) =>
      incompatible && row.id === "b2" ? { ...row, currency: "USD" } : row,
    ),
  );
  const apiRef = useRef<GridApi<(typeof rows)[number]> | null>(null);
  const actions = useBulkTransactionActions({
    scopeKey,
    rows: data,
    deleteTransactions,
    invalidate,
    onRefreshConstraints,
    rebook:
      mode === "ledger"
        ? {
            currentAccountId: "source",
            accountOptions,
            getBooking: (row) => row,
            submit: submitRebook,
          }
        : undefined,
  });
  return (
    <Stack>
      <Group>
        <Button onClick={() => setScopeKey("second")}>Change Period</Button>
        <Button
          onClick={() =>
            setData((current) => current.map((row) => ({ ...row })))
          }
        >
          Refresh Rows
        </Button>
        <Button
          onClick={() =>
            apiRef.current?.setFilterModel({
              description: {
                filterType: "text",
                type: "equals",
                filter: "First",
              },
            })
          }
        >
          Filter to First
        </Button>
        <Button
          onClick={() =>
            setData((current) =>
              current.map((row) =>
                row.id === "b1"
                  ? { ...row, isOpeningBalancesTransaction: true }
                  : row,
              ),
            )
          }
        >
          Protect First
        </Button>
      </Group>
      <BulkTransactionToolbar actions={actions} />
      <DataGrid
        {...actions.gridProps}
        onGridReady={(event) => {
          apiRef.current = event.api;
          actions.gridProps.onGridReady?.(event);
        }}
        rowData={data}
        getRowId={({ data }) => data.id}
        columnDefs={[
          { field: "description", filter: "agTextColumnFilter", flex: 1 },
        ]}
        containerStyle={{ height: 330 }}
      />
      <BulkTransactionDialogs actions={actions} />
    </Stack>
  );
}

const meta = {
  title: "Components/BulkTransactionActions",
  component: Harness,
  args: {
    mode: "ledger",
    deleteTransactions: fn(async () => undefined),
    submitRebook: fn(async () => undefined),
    invalidate: fn(),
    onRefreshConstraints: fn(async () => undefined),
  },
} satisfies Meta<typeof Harness>;
export default meta;
type Story = StoryObj<typeof meta>;

async function selectRow(canvasElement: HTMLElement, id: string) {
  await waitFor(() =>
    expect(
      canvasElement.querySelector(
        `.ag-row[row-id="${id}"] .ag-selection-checkbox input`,
      ),
    ).not.toBeNull(),
  );
  await userEvent.click(
    canvasElement.querySelector(
      `.ag-row[row-id="${id}"] .ag-selection-checkbox input`,
    )!,
  );
}

export const SelectAllAndDelete: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(() =>
      expect(
        canvasElement.querySelector(".ag-header-select-all input"),
      ).not.toBeNull(),
    );
    await expect(canvas.queryByRole("toolbar")).not.toBeInTheDocument();
    await userEvent.click(
      canvasElement.querySelector(".ag-header-select-all input")!,
    );
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "3 bookings selected",
    );
    const protectedInput = canvasElement.querySelector(
      '.ag-row[row-id="opening"] .ag-selection-checkbox input',
    );
    await expect(protectedInput).toBeDisabled();
    await expect(
      canvasElement.querySelector(
        '.ag-row[row-id="virtual"] .ag-selection-checkbox',
      ),
    ).not.toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Delete Selected" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Delete Transactions" }),
    );
    await waitFor(() =>
      expect(
        dialog.getByText(
          "Are you sure you want to delete 2 selected transactions?",
        ),
      ).toBeVisible(),
    );
    await expect(
      dialog.getByText(/including bookings in other accounts/),
    ).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "3 bookings selected",
    );
    await waitFor(
      () => expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
      { timeout: 3000 },
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Delete Selected" }),
    );
    await userEvent.click(
      within(await body.findByRole("dialog")).getByRole("button", {
        name: "Delete",
      }),
    );
    await expect(args.deleteTransactions).toHaveBeenCalledWith(["t1", "t2"]);
    await expect(args.invalidate).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(canvas.queryByRole("toolbar")).not.toBeInTheDocument(),
    );
  },
};

export const SelectionLifecycle: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await selectRow(canvasElement, "b1");
    await selectRow(canvasElement, "b2");
    await userEvent.click(canvas.getByRole("button", { name: "Refresh Rows" }));
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "2 bookings selected",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Filter to First" }),
    );
    await waitFor(() =>
      expect(canvas.getByRole("status")).toHaveTextContent(
        "1 booking selected",
      ),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Change Period" }),
    );
    await waitFor(() =>
      expect(canvas.queryByRole("toolbar")).not.toBeInTheDocument(),
    );
    await selectRow(canvasElement, "b1");
    await userEvent.click(
      canvas.getByRole("button", { name: "Protect First" }),
    );
    await waitFor(() =>
      expect(canvas.queryByRole("toolbar")).not.toBeInTheDocument(),
    );
  },
};

export const RebookSelection: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await selectRow(canvasElement, "b1");
    await selectRow(canvasElement, "b2");
    await userEvent.click(
      canvas.getByRole("button", { name: "Rebook Selected" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Rebook Bookings" }),
    );
    await waitFor(() =>
      expect(
        dialog.getByText(
          "Move 2 selected bookings to the target account or category.",
        ),
      ).toBeVisible(),
    );
    await userEvent.click(dialog.getByLabelText("Account or category"));
    await userEvent.click(await body.findByRole("option", { name: "Savings" }));
    await userEvent.click(dialog.getByRole("button", { name: "Rebook" }));
    await expect(args.submitRebook).toHaveBeenCalledWith(
      ["b1", "b2"],
      "target",
    );
    await waitFor(() =>
      expect(canvas.queryByRole("toolbar")).not.toBeInTheDocument(),
    );
  },
};

export const DeleteFailure: Story = {
  args: {
    mode: "transactions",
    deleteTransactions: fn(async () => {
      throw new Error(
        "The selected transaction changed. Refresh and try again.",
      );
    }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await selectRow(canvasElement, "b1");
    await expect(
      canvas.queryByRole("button", { name: "Rebook Selected" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Delete Selected" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      "The selected transaction changed.",
    );
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "1 transaction selected",
    );
    await expect(args.onRefreshConstraints).toHaveBeenCalledTimes(1);
    await expect(args.invalidate).not.toHaveBeenCalled();
  },
};

export const PendingDelete: Story = {
  args: {
    deleteTransactions: fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await selectRow(canvasElement, "b1");
    await userEvent.click(
      canvas.getByRole("button", { name: "Delete Selected" }),
    );
    const element = await body.findByRole("dialog");
    const dialog = within(element);
    await waitFor(() => expect(element).toBeVisible());
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Delete" })).toBeDisabled();
    await userEvent.keyboard("{Escape}{Enter}");
    await expect(element).toBeVisible();
    await waitFor(
      () => expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
      { timeout: 3000 },
    );
    await expect(args.deleteTransactions).toHaveBeenCalledTimes(1);
  },
};

export const ShiftSelectionAndClear: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(
        canvasElement.querySelector(
          '.ag-row[row-id="b1"] [col-id="description"]',
        ),
      ).not.toBeNull(),
    );
    await userEvent.click(
      canvasElement.querySelector(
        '.ag-row[row-id="b1"] [col-id="description"]',
      )!,
    );
    await expect(canvas.queryByRole("toolbar")).not.toBeInTheDocument();
    await selectRow(canvasElement, "b1");
    const user = userEvent.setup();
    await user.keyboard("{Shift>}");
    await user.click(
      canvasElement.querySelector(
        '.ag-row[row-id="b3"] .ag-selection-checkbox input',
      )!,
    );
    await user.keyboard("{/Shift}");
    await waitFor(() =>
      expect(canvas.getByRole("status")).toHaveTextContent(
        "3 bookings selected",
      ),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear Selection" }),
    );
    await expect(canvas.queryByRole("toolbar")).not.toBeInTheDocument();
  },
};

export const NoCommonRebookTarget: Story = {
  args: { incompatible: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await selectRow(canvasElement, "b1");
    await selectRow(canvasElement, "b2");
    await userEvent.click(
      canvas.getByRole("button", { name: "Rebook Selected" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await expect(dialog.getByLabelText("Account or category")).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Rebook" })).toBeDisabled();
    await waitFor(() =>
      expect(
        dialog.getByText(/No target account or category is compatible/),
      ).toBeVisible(),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "2 bookings selected",
    );
  },
};

export const RebookFailure: Story = {
  args: {
    submitRebook: fn(async () => {
      throw new Error("Target account is no longer active.");
    }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await selectRow(canvasElement, "b1");
    await userEvent.click(
      canvas.getByRole("button", { name: "Rebook Selected" }),
    );
    const element = await body.findByRole("dialog");
    await waitFor(() => expect(element).toBeVisible());
    const dialog = within(element);
    await userEvent.click(dialog.getByLabelText("Account or category"));
    await userEvent.click(await body.findByRole("option", { name: "Savings" }));
    await userEvent.click(dialog.getByRole("button", { name: "Rebook" }));
    await expect(
      await dialog.findByText("Target account is no longer active."),
    ).toBeVisible();
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "1 booking selected",
    );
    await expect(args.onRefreshConstraints).toHaveBeenCalledTimes(1);
    await expect(args.invalidate).not.toHaveBeenCalled();
  },
};

export const PendingRebook: Story = {
  args: {
    submitRebook: fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await selectRow(canvasElement, "b1");
    await userEvent.click(
      canvas.getByRole("button", { name: "Rebook Selected" }),
    );
    const element = await body.findByRole("dialog");
    await waitFor(() => expect(element).toBeVisible());
    const dialog = within(element);
    await userEvent.click(dialog.getByLabelText("Account or category"));
    await userEvent.click(await body.findByRole("option", { name: "Savings" }));
    await userEvent.click(dialog.getByRole("button", { name: "Rebook" }));
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Rebook" })).toBeDisabled();
    await userEvent.keyboard("{Escape}{Enter}");
    await expect(element).toBeVisible();
    await waitFor(
      () => expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
      { timeout: 3000 },
    );
    await expect(args.submitRebook).toHaveBeenCalledTimes(1);
  },
};
