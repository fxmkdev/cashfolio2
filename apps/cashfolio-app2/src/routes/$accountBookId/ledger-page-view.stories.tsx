import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRouterState } from "@tanstack/react-router";
import { Box, Text } from "@mantine/core";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { AccountType, Unit } from "../../.prisma-client/enums";
import {
  accountOptions as baseAccountOptions,
  editTransactionInitialValues,
} from "../../components/storybook-fixtures";
import { useLedgerColumnDefs } from "./ledger-page-columns";
import {
  LedgerPageView,
  type EditMode,
  type LedgerPageViewProps,
  type RebookingState,
  type SimpleTransactionValues,
  type SplitModalInitialValues,
  type TransactionMutationValues,
} from "./ledger-page-view";
import type { LedgerRow } from "./ledger-page-types";

const account = {
  id: "account-checking",
  name: "Checking",
  isActive: true,
  type: AccountType.ASSET,
  equityAccountSubtype: null,
  unit: Unit.CURRENCY,
  currency: "CHF",
  cryptocurrency: null,
  symbol: null,
  tradeCurrency: null,
  groupPathSegments: ["Assets", "Cash"],
};

const rows: LedgerRow[] = [
  {
    id: "booking-2",
    transactionId: "transaction-2",
    bookingValue: -84.5,
    date: "15.01.2026",
    counterpartyAccounts: [{ id: "account-groceries", name: "Groceries" }],
    description: "Grocery shopping",
    unit: Unit.CURRENCY,
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    debit: null,
    credit: 84.5,
    balance: 915.5,
  },
  {
    id: "booking-1",
    transactionId: "transaction-1",
    bookingValue: 1000,
    date: "10.01.2026",
    counterpartyAccounts: [{ id: "account-salary", name: "Salary" }],
    description: "Salary",
    unit: Unit.CURRENCY,
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    debit: 1000,
    credit: null,
    balance: 1000,
  },
];

const createSplitInitialValues: SplitModalInitialValues = {
  description: "Groceries",
  bookings: [
    {
      date: "2026-01-15",
      account: "account-groceries",
      description: "",
      unit: Unit.CURRENCY,
      currency: "CHF",
      debit: 84.5,
    },
    {
      date: "2026-01-15",
      account: "account-checking",
      description: "",
      unit: Unit.CURRENCY,
      currency: "CHF",
      credit: 84.5,
    },
  ],
};

function LedgerPageStoryHarness({
  routeSmoke = false,
  startWithSimpleModal = false,
  startWithSplitModal = false,
  startWithEditModal = false,
}: {
  routeSmoke?: boolean;
  startWithSimpleModal?: boolean;
  startWithSplitModal?: boolean;
  startWithEditModal?: boolean;
}) {
  const [simpleModalOpened, setSimpleModalOpened] =
    useState(startWithSimpleModal);
  const [splitModalOpened, setSplitModalOpened] = useState(startWithSplitModal);
  const [editModalOpened, setEditModalOpened] = useState(startWithEditModal);
  const [isSimpleSubmitting, setIsSimpleSubmitting] = useState(false);
  const [isCreateSplitSubmitting, setIsCreateSplitSubmitting] = useState(false);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [isRebookSubmitting, setIsRebookSubmitting] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>("SPLIT");
  const [rebookModalOpened, setRebookModalOpened] = useState(false);
  const [editingTransactionData, setEditingTransactionData] = useState<
    LedgerPageViewProps["editingTransactionData"]
  >(
    startWithEditModal
      ? {
          id: "transaction-2",
          description: editTransactionInitialValues.description,
          bookings: editTransactionInitialValues.bookings,
        }
      : undefined,
  );
  const [editingSimpleInitialValues, setEditingSimpleInitialValues] = useState<
    | {
        date: Date;
        description: string;
        counterAccountId: string;
        amount: number;
        direction: "DEBIT" | "CREDIT";
      }
    | undefined
  >();
  const [deletingTransaction, setDeletingTransaction] = useState<
    { id: string; description: string } | undefined
  >();
  const [rebooking, setRebooking] = useState<RebookingState | undefined>();

  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const columnDefs = useLedgerColumnDefs({
    accountBookId: "storybook-book",
    isEquity: false,
    isIncome: false,
    isExpense: false,
    onEditClick: (transactionId) => {
      setEditingTransactionData({
        id: transactionId,
        description: editTransactionInitialValues.description,
        bookings: editTransactionInitialValues.bookings,
      });
      setEditModalOpened(true);
      setEditMode("SPLIT");
    },
    onRebookClick: (args) => {
      setRebooking(args);
      setRebookModalOpened(true);
    },
    onDeleteClick: (transactionId, description) => {
      setDeletingTransaction({ id: transactionId, description });
    },
  });

  return (
    <Box>
      <LedgerPageView
        accountBookId="storybook-book"
        backTab="ASSET"
        account={account}
        rows={rows}
        columnDefs={columnDefs}
        currentAccountLabel="Asset / Cash / Checking"
        unitLabel="CHF"
        simpleTransactionDisabledReason={null}
        simpleModalOpened={simpleModalOpened}
        splitModalOpened={splitModalOpened}
        editModalOpened={editModalOpened}
        isSimpleSubmitting={isSimpleSubmitting}
        isCreateSplitSubmitting={isCreateSplitSubmitting}
        isEditSubmitting={isEditSubmitting}
        isRebookSubmitting={isRebookSubmitting}
        editMode={editMode}
        createSplitInitialValues={createSplitInitialValues}
        editingTransactionData={editingTransactionData}
        editingSimpleInitialValues={editingSimpleInitialValues}
        deletingTransaction={deletingTransaction}
        rebooking={rebooking}
        rebookModalOpened={rebookModalOpened}
        hasCompleteBookingUnit={true}
        accountOptions={baseAccountOptions}
        editAccountOptions={baseAccountOptions}
        simpleCounterAccountOptions={baseAccountOptions}
        editSimpleCounterAccountOptions={baseAccountOptions}
        rebookTargetAccountOptions={[
          { value: "account-groceries", label: "Groceries (Expense)" },
        ]}
        onRowDataUpdated={() => undefined}
        onAddTransactionClick={() => {
          setSplitModalOpened(false);
          setSimpleModalOpened(true);
        }}
        onCloseSimpleModal={() => setSimpleModalOpened(false)}
        onSimpleSubmittingChange={setIsSimpleSubmitting}
        onSwitchCreateToSplit={() => {
          setSimpleModalOpened(false);
          setSplitModalOpened(true);
        }}
        onSubmitCreateSimpleTransaction={async (
          _values: SimpleTransactionValues,
        ) => {
          setSimpleModalOpened(false);
        }}
        onCloseSplitModal={() => setSplitModalOpened(false)}
        onCreateSplitSubmittingChange={setIsCreateSplitSubmitting}
        onSubmitCreateTransaction={async (
          _values: TransactionMutationValues,
        ) => {
          setSplitModalOpened(false);
        }}
        onCloseEditModal={() => setEditModalOpened(false)}
        onEditSubmittingChange={setIsEditSubmitting}
        onEditModalExitTransitionEnd={() => {
          setEditingTransactionData(undefined);
          setEditingSimpleInitialValues(undefined);
          setEditMode("SPLIT");
        }}
        onSwitchToSplit={() => {
          setEditMode("SPLIT");
          setEditingSimpleInitialValues(undefined);
        }}
        onSubmitUpdateSimpleTransaction={async (
          _values: SimpleTransactionValues,
        ) => {
          setEditModalOpened(false);
        }}
        onSubmitUpdateTransaction={async (
          _values: TransactionMutationValues,
        ) => {
          setEditModalOpened(false);
        }}
        onCloseRebookModal={() => setRebookModalOpened(false)}
        onRebookSubmittingChange={setIsRebookSubmitting}
        onRebookModalExitTransitionEnd={() => setRebooking(undefined)}
        onSubmitRebookBooking={async () => {
          setRebookModalOpened(false);
        }}
        onCloseDeleteModal={() => setDeletingTransaction(undefined)}
        onConfirmDeleteTransaction={async () => {
          setDeletingTransaction(undefined);
        }}
      />
      {routeSmoke ? <Text data-testid="router-path">{pathname}</Text> : null}
    </Box>
  );
}

const meta = {
  title: "Routes/LedgerPageView",
} satisfies Meta;

export default meta;

type Story = StoryObj;

export const HappyPath: Story = {
  render: () => <LedgerPageStoryHarness />,
};

export const ModalStates: Story = {
  render: () => (
    <LedgerPageStoryHarness
      startWithSimpleModal={true}
      startWithSplitModal={true}
      startWithEditModal={true}
    />
  ),
};

export const RouteSmoke: Story = {
  render: () => <LedgerPageStoryHarness routeSmoke={true} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("link", { name: "Accounts" }));
    await expect(canvas.getByTestId("router-path")).toHaveTextContent(
      "/storybook-book/accounts",
    );
  },
};
