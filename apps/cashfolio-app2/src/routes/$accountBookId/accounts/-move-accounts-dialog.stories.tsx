import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { useState } from "react";
import type { MoveAccountsInput } from "@/shared/bulk-account-move";
import { AccountType, Unit } from "@/.prisma-client/enums";
import { MoveAccountsDialog } from "./-move-accounts-dialog";
import type { TreeRow } from "./-page-types";

const base: TreeRow = {
  id: "first",
  name: "Checking",
  nodeType: "account",
  type: AccountType.BALANCE,
  equityAccountSubtype: null,
  unit: Unit.CURRENCY,
  currency: "CHF",
  cryptocurrency: null,
  symbol: null,
  tradeCurrency: null,
  balance: 0,
  balanceInReferenceCurrency: 0,
  openingBalance: null,
  parentId: "source",
  groupId: "source",
  isActive: true,
  isCashAccount: true,
  sortOrder: null,
  deletable: false,
  deleteDisabledReason: undefined,
  archivable: false,
  archiveDisabledReason: undefined,
  unarchivable: false,
  unarchiveDisabledReason: undefined,
};
const group = (id: string, name: string, isCashAccount = false): TreeRow => ({
  ...base,
  id,
  name,
  nodeType: "accountGroup",
  groupId: id,
  parentId: undefined,
  unit: null,
  isCashAccount,
});
const rows: TreeRow[] = [
  base,
  {
    ...base,
    id: "second",
    name: "Closed",
    isActive: false,
    isCashAccount: false,
  },
  group("source", "Source", true),
  group("target", "Destination"),
  group("cash", "Cash Destination", true),
  group("conflict", "Conflicting Destination"),
  { ...group("archived", "Archived Destination"), isActive: false },
];
const meta = {
  title: "Routes/Accounts/MoveAccountsDialog",
  component: MoveAccountsDialog,
  args: {
    target: { accountIds: ["first", "second"], archivedCount: 1 },
    rows,
    existingAccounts: [
      { id: "conflict-account", name: "checking", groupId: "conflict" },
    ],
    onClose: fn(),
    onSubmit: fn(
      async (
        _data: Pick<
          MoveAccountsInput,
          "targetGroupId" | "expectedCashFlowChanges"
        >,
      ): Promise<void> => undefined,
    ),
    onRefreshConstraints: fn(async (): Promise<void> => undefined),
  },
} satisfies Meta<typeof MoveAccountsDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

async function chooseGroup(canvasElement: HTMLElement, label: string) {
  const body = within(canvasElement.ownerDocument.body);
  const dialog = within(
    await body.findByRole("dialog", { name: "Move Accounts to Group" }),
  );
  await userEvent.click(dialog.getByLabelText("Destination Group"));
  await userEvent.click(body.getByRole("option", { name: label }));
  return dialog;
}

export const ExcludesFromCashFlow: Story = {
  play: async ({ canvasElement, args }) => {
    const dialog = await chooseGroup(canvasElement, "Destination");
    await expect(
      dialog.queryByText(
        "Accounts move directly to the destination. Groups and subgroups stay in place.",
      ),
    ).not.toBeInTheDocument();
    await expect(
      dialog.getByText(/1 will be excluded from cash flow: Checking/),
    ).toBeVisible();
    await expect(dialog.getByText(/all historical periods/)).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Move" }));
    await expect(args.onSubmit).toHaveBeenCalledWith({
      targetGroupId: "target",
      expectedCashFlowChanges: {
        includedAccountIds: [],
        excludedAccountIds: ["first"],
      },
    });
  },
};
export const IncludesInCashFlow: Story = {
  play: async ({ canvasElement, args }) => {
    const dialog = await chooseGroup(canvasElement, "Cash Destination");
    await expect(
      dialog.getByText(/1 will be included in cash flow: Closed/),
    ).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Move" }));
    await expect(args.onSubmit).toHaveBeenCalledWith({
      targetGroupId: "cash",
      expectedCashFlowChanges: {
        includedAccountIds: ["second"],
        excludedAccountIds: [],
      },
    });
  },
};
export const NoGroupPreservesCashFlow: Story = {
  play: async ({ canvasElement, args }) => {
    const dialog = await chooseGroup(canvasElement, "No Group");
    await expect(dialog.getByText(/preserves each account/)).toBeVisible();
    await expect(
      dialog.queryByText("Cash Flow Changes"),
    ).not.toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "Move" }));
    await expect(args.onSubmit).toHaveBeenCalledWith({
      targetGroupId: null,
      expectedCashFlowChanges: {
        includedAccountIds: [],
        excludedAccountIds: [],
      },
    });
  },
};
export const NameConflict: Story = {
  play: async ({ canvasElement, args }) => {
    const dialog = await chooseGroup(canvasElement, "Conflicting Destination");
    await expect(
      dialog.getByText(/another account would have the same name/),
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Move" })).toBeDisabled();
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};
export const IncompatibleDestinations: Story = {
  args: {
    rows: rows.map((row) =>
      row.id === "second" ? { ...row, unit: Unit.SECURITY } : row,
    ),
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByLabelText("Destination Group"));
    await expect(
      body.queryByRole("option", { name: "Cash Destination" }),
    ).not.toBeInTheDocument();
    await expect(
      body.queryByRole("option", { name: "Archived Destination" }),
    ).not.toBeInTheDocument();
    await expect(
      body.getByRole("option", { name: "Destination" }),
    ).toBeVisible();
  },
};
export const AlreadyInDestination: Story = {
  args: {
    rows: rows.map((row) =>
      row.nodeType === "account"
        ? { ...row, groupId: "target", parentId: "target" }
        : row,
    ),
  },
  play: async ({ canvasElement }) => {
    const dialog = await chooseGroup(canvasElement, "Destination");
    await expect(dialog.getByText(/0 accounts will move/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Move" })).toBeDisabled();
  },
};
export const StaleCashFlowPreview: Story = {
  render: function StalePreview(args) {
    const [currentRows, setCurrentRows] = useState(args.rows);
    return (
      <MoveAccountsDialog
        {...args}
        rows={currentRows}
        onRefreshConstraints={async () => {
          await args.onRefreshConstraints?.();
          setCurrentRows(
            rows.map((row) =>
              row.id === "target" ? { ...row, isCashAccount: true } : row,
            ),
          );
        }}
      />
    );
  },
  play: async ({ canvasElement, args }) => {
    args.onSubmit.mockRejectedValueOnce(
      new Error(
        "Cash-flow inclusion has changed since this move was reviewed.",
      ),
    );
    const dialog = await chooseGroup(canvasElement, "Destination");
    await userEvent.click(dialog.getByRole("button", { name: "Move" }));
    await expect(
      await dialog.findByText(
        "Cash-flow inclusion has changed since this move was reviewed.",
      ),
    ).toBeVisible();
    await expect(dialog.getByLabelText("Destination Group")).toHaveValue(
      "Destination",
    );
    await expect(
      await dialog.findByText(/1 will be included in cash flow: Closed/),
    ).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Move" }));
    await expect(args.onSubmit).toHaveBeenLastCalledWith({
      targetGroupId: "target",
      expectedCashFlowChanges: {
        includedAccountIds: ["second"],
        excludedAccountIds: [],
      },
    });
  },
};
export const MoveSubmissionGuards: Story = {
  play: async ({ canvasElement, args }) => {
    let finish: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    args.onSubmit.mockImplementationOnce(() => pending);
    const dialog = await chooseGroup(canvasElement, "Destination");
    await userEvent.click(dialog.getByRole("button", { name: "Move" }));
    try {
      await expect(
        dialog.getByRole("button", { name: "Cancel" }),
      ).toBeDisabled();
      await expect(dialog.getByLabelText("Destination Group")).toBeDisabled();
      await userEvent.keyboard("{Enter}{Escape}");
      await expect(args.onSubmit).toHaveBeenCalledTimes(1);
      await expect(args.onClose).not.toHaveBeenCalled();
    } finally {
      finish();
    }
    await waitFor(() =>
      expect(dialog.getByRole("button", { name: "Cancel" })).toBeEnabled(),
    );
  },
};

export const CancelBeforeChoosing: Story = {
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Move Accounts to Group" }),
    );
    await waitFor(() =>
      expect(dialog.getByText(/2 accounts selected/)).toHaveFocus(),
    );
    await expect(
      body.queryByRole("option", { name: "No Group" }),
    ).not.toBeInTheDocument();
    await expect(dialog.getByRole("button", { name: "Move" })).toBeDisabled();
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await expect(args.onClose).toHaveBeenCalledTimes(1);
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};
