import type { Meta, StoryObj } from "@storybook/react-vite";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Box, Text } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { expect, screen, userEvent, within } from "storybook/test";
import { AccountType, Unit } from "@/.prisma-client/enums";
import {
  accountOptions as baseAccountOptions,
  editTransactionInitialValues,
} from "@/components/storybook-fixtures";
import { formatMonthPeriodValue } from "@/shared/period";
import {
  buildPeriodSelectorModel,
  getMonthPickerValue,
  getPeriodModeChangeValue,
  getPeriodStepValue,
  getYearPickerValue,
  type PeriodMode,
} from "@/shared/period-selector-model";
import { useLedgerColumnDefs } from "./-page-columns";
import type { SimpleTransactionEditInitialValues } from "./-page-data";
import { LedgerPeriodFilterCard } from "./-period-filter-card";
import { parseLedgerExplicitPeriod, type LedgerRow } from "./-page-types";
import {
  LedgerPageView,
  type EditMode,
  type LedgerPageViewProps,
  type RebookingState,
  type SimpleTransactionValues,
  type SplitModalInitialValues,
  type TransactionMutationValues,
} from "./-page-view";

const assetAccount = {
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
    isOpeningBalancesTransaction: false,
    debit: null,
    credit: 84.5,
    referenceDebit: null,
    referenceCredit: null,
    balance: 915.5,
    isVirtualCarryOver: false,
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
    isOpeningBalancesTransaction: false,
    debit: 1000,
    credit: null,
    referenceDebit: null,
    referenceCredit: null,
    balance: 1000,
    isVirtualCarryOver: false,
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
  includePeriodFilterControls = false,
  accountType = AccountType.ASSET,
  startWithSimpleModal = false,
  startWithSplitModal = false,
  startWithEditModal = false,
  accountActive = true,
  accountActionsDisabled = false,
}: {
  routeSmoke?: boolean;
  includePeriodFilterControls?: boolean;
  accountType?: AccountType;
  startWithSimpleModal?: boolean;
  startWithSplitModal?: boolean;
  startWithEditModal?: boolean;
  accountActive?: boolean;
  accountActionsDisabled?: boolean;
}) {
  const [accountEditModalOpened, setAccountEditModalOpened] = useState(false);
  const [archivingAccount, setArchivingAccount] = useState<
    { id: string; name: string } | undefined
  >();
  const [deletingAccount, setDeletingAccount] = useState<
    { id: string; name: string } | undefined
  >();
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
    SimpleTransactionEditInitialValues | undefined
  >();
  const [deletingTransaction, setDeletingTransaction] = useState<
    { id: string; description: string } | undefined
  >();
  const [rebooking, setRebooking] = useState<RebookingState | undefined>();
  const [pickerOpened, setPickerOpened] = useState(false);
  const [unfilteredPeriodMode, setUnfilteredPeriodMode] =
    useState<PeriodMode>("month");

  const navigate = useNavigate({ from: "/$accountBookId/$accountId" });
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const routeSearch = useRouterState({
    select: (state) => state.location.search,
  });
  const routeSearchPeriod =
    typeof routeSearch.period === "string" ? routeSearch.period : undefined;
  const selectedPeriod = useMemo(
    () => parseLedgerExplicitPeriod(routeSearchPeriod),
    [routeSearchPeriod],
  );
  useEffect(() => {
    if (!selectedPeriod) {
      return;
    }
    setUnfilteredPeriodMode(selectedPeriod.granularity);
  }, [selectedPeriod]);
  const maxDate = useMemo(() => new Date("2026-03-28T00:00:00.000Z"), []);
  const minBookingDate = useMemo(
    () => new Date("2021-03-01T00:00:00.000Z"),
    [],
  );
  const periodMode = selectedPeriod?.granularity ?? unfilteredPeriodMode;
  const selectedYear = selectedPeriod?.year ?? maxDate.getUTCFullYear();
  const selectedMonth = selectedPeriod?.month ?? maxDate.getUTCMonth();
  const periodSelectorModel = useMemo(
    () =>
      buildPeriodSelectorModel({
        selectedGranularity: periodMode,
        selectedYear,
        selectedMonth: periodMode === "month" ? selectedMonth : null,
        minBookingDate,
        maxDate,
      }),
    [maxDate, minBookingDate, periodMode, selectedMonth, selectedYear],
  );
  const hasPeriodFilter = selectedPeriod != null;
  const account =
    accountType === AccountType.EQUITY
      ? {
          ...assetAccount,
          id: "account-equity",
          name: "Retained Earnings",
          isActive: accountActive,
          type: AccountType.EQUITY,
          groupPathSegments: ["Equity"],
        }
      : { ...assetAccount, isActive: accountActive };

  const setPeriodFilter = (nextPeriodValue: string | undefined) => {
    navigate({
      search: (previousSearch) => ({
        ...previousSearch,
        period: nextPeriodValue,
      }),
    });
  };

  const columnDefs = useLedgerColumnDefs({
    accountBookId: "storybook-book",
    hasPeriodFilter,
    referenceCurrency: null,
    isEquity: accountType === AccountType.EQUITY,
    isOpeningBalances: false,
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
    <Box
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100dvh",
      }}
    >
      <LedgerPageView
        accountBookId="storybook-book"
        backTab="ASSET"
        account={account}
        accountGroups={[]}
        existingNodes={[]}
        rows={rows}
        columnDefs={columnDefs}
        currentAccountLabel="Asset / Cash / Checking"
        unitLabel="CHF"
        accountBookStartDate={new Date("2026-01-04T00:00:00.000Z")}
        simpleTransactionDisabledReason={null}
        simpleModalOpened={simpleModalOpened}
        splitModalOpened={splitModalOpened}
        accountEditModalOpened={accountEditModalOpened}
        accountEditInitialValues={{
          name: account.name,
          type: account.type,
          equityAccountSubtype: account.equityAccountSubtype,
          groupId: undefined,
          sortOrder: undefined,
          unit: account.unit,
          currency: account.currency,
          cryptocurrency: account.cryptocurrency,
          symbol: account.symbol,
          tradeCurrency: account.tradeCurrency,
          openingBalance: 1000,
        }}
        editModalOpened={editModalOpened}
        isSimpleSubmitting={isSimpleSubmitting}
        isCreateSplitSubmitting={isCreateSplitSubmitting}
        isEditSubmitting={isEditSubmitting}
        isRebookSubmitting={isRebookSubmitting}
        editMode={editMode}
        createSplitInitialValues={createSplitInitialValues}
        editingTransactionData={editingTransactionData}
        editingSimpleInitialValues={editingSimpleInitialValues}
        deletingAccount={deletingAccount}
        archivingAccount={archivingAccount}
        deletingTransaction={deletingTransaction}
        rebooking={rebooking}
        rebookModalOpened={rebookModalOpened}
        hasCompleteBookingUnit={true}
        unitUsage={{
          currencies: ["CHF", "EUR", "USD"],
          cryptocurrencies: ["BTC"],
        }}
        accountOptions={baseAccountOptions}
        editAccountOptions={baseAccountOptions}
        simpleCounterAccountOptions={baseAccountOptions}
        editSimpleCounterAccountOptions={baseAccountOptions}
        rebookTargetAccountOptions={[
          { value: "account-groceries", label: "Groceries (Expense)" },
        ]}
        accountArchivable={accountActive && !accountActionsDisabled}
        accountArchiveLabel={
          accountActionsDisabled
            ? "Cannot archive account because its balance is not 0"
            : "Archive"
        }
        accountUnarchivable={!accountActive && !accountActionsDisabled}
        accountUnarchiveLabel={
          accountActionsDisabled
            ? "Cannot unarchive account because its parent group is archived"
            : "Unarchive"
        }
        accountDeletable={!accountActionsDisabled}
        accountDeleteLabel={
          accountActionsDisabled
            ? "Cannot delete account because it has bookings"
            : "Delete"
        }
        periodFilterControls={
          includePeriodFilterControls ? (
            <LedgerPeriodFilterCard
              hasPeriodFilter={hasPeriodFilter}
              periodMode={periodMode}
              selectedPeriodLabel={selectedPeriod?.label ?? "All periods"}
              pickerOpened={pickerOpened}
              onPickerOpenedChange={setPickerOpened}
              canGoToPreviousPeriod={
                hasPeriodFilter && periodSelectorModel.canGoToPreviousPeriod
              }
              canGoToNextPeriod={
                hasPeriodFilter && periodSelectorModel.canGoToNextPeriod
              }
              onPeriodModeChange={(nextMode) => {
                const nextPeriodMode = nextMode as PeriodMode;
                if (!hasPeriodFilter) {
                  setUnfilteredPeriodMode(nextPeriodMode);
                  return;
                }

                setPickerOpened(false);
                const nextPeriodValue = getPeriodModeChangeValue({
                  nextMode: nextPeriodMode,
                  periodMode,
                  selectedYear,
                  selectedYearMaxMonth:
                    periodSelectorModel.selectedYearMonthBounds.maxMonth,
                });
                if (!nextPeriodValue) {
                  return;
                }
                setPeriodFilter(nextPeriodValue);
              }}
              onPeriodStep={(step) => {
                if (!hasPeriodFilter) {
                  return;
                }

                setPickerOpened(false);
                const nextPeriodValue = getPeriodStepValue({
                  periodMode,
                  step,
                  selectedMonthIndex: periodSelectorModel.selectedMonthIndex,
                  minMonthIndex: periodSelectorModel.minMonthIndex,
                  maxMonthIndex: periodSelectorModel.maxMonthIndex,
                  selectedYear,
                  minYear: periodSelectorModel.minYear,
                  maxYear: periodSelectorModel.maxYear,
                });
                if (!nextPeriodValue) {
                  return;
                }
                setPeriodFilter(nextPeriodValue);
              }}
              selectedMonthValue={
                hasPeriodFilter
                  ? formatMonthPeriodValue(selectedYear, selectedMonth) + "-01"
                  : null
              }
              selectedYearValue={
                hasPeriodFilter
                  ? `${String(selectedYear).padStart(4, "0")}-01-01`
                  : null
              }
              monthPickerDefaultValue={
                formatMonthPeriodValue(selectedYear, selectedMonth) + "-01"
              }
              yearPickerDefaultValue={`${String(selectedYear).padStart(4, "0")}-01-01`}
              minMonthPickerDate={periodSelectorModel.minMonthPickerDate}
              maxMonthPickerDate={periodSelectorModel.maxMonthPickerDate}
              minYearPickerDate={periodSelectorModel.minYearPickerDate}
              maxYearPickerDate={periodSelectorModel.maxYearPickerDate}
              onMonthPickerChange={(nextValue) => {
                const nextPeriodValue = getMonthPickerValue(nextValue);
                if (!nextPeriodValue) {
                  return;
                }
                setPeriodFilter(nextPeriodValue);
                setPickerOpened(false);
              }}
              onYearPickerChange={(nextValue) => {
                const nextPeriodValue = getYearPickerValue(nextValue);
                if (!nextPeriodValue) {
                  return;
                }
                setPeriodFilter(nextPeriodValue);
                setPickerOpened(false);
              }}
              onClearFilter={() => {
                setPickerOpened(false);
                setPeriodFilter(undefined);
              }}
            />
          ) : undefined
        }
        onRowDataUpdated={() => undefined}
        onOpenAccountEdit={() => setAccountEditModalOpened(true)}
        onCloseAccountEdit={() => setAccountEditModalOpened(false)}
        onSubmitUpdateAccount={async () => {
          setAccountEditModalOpened(false);
        }}
        onOpenArchiveAccount={() =>
          setArchivingAccount({ id: account.id, name: account.name })
        }
        onCloseArchiveAccount={() => setArchivingAccount(undefined)}
        onConfirmArchiveAccount={async () => {
          setArchivingAccount(undefined);
        }}
        onUnarchiveAccount={async () => undefined}
        onOpenDeleteAccount={() =>
          setDeletingAccount({ id: account.id, name: account.name })
        }
        onCloseDeleteAccount={() => setDeletingAccount(undefined)}
        onConfirmDeleteAccount={async () => {
          setDeletingAccount(undefined);
        }}
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
      {routeSmoke ? (
        <Text data-testid="router-search-period">
          {routeSearchPeriod ?? "(none)"}
        </Text>
      ) : null}
    </Box>
  );
}

const meta: Meta<typeof LedgerPageView> = {
  title: "Routes/LedgerPageView",
  component: LedgerPageView,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const HappyPath: Story = {
  render: () => <LedgerPageStoryHarness />,
};

export const AccountActionsMenu: Story = {
  render: () => <LedgerPageStoryHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole("button", { name: "Account actions" }),
    );

    await expect(
      screen.getByRole("menuitem", { name: "Archive" }),
    ).toBeVisible();
    await expect(
      screen.getByRole("menuitem", { name: "Delete" }),
    ).toBeVisible();
  },
};

export const ArchivedAccountActionsMenu: Story = {
  render: () => <LedgerPageStoryHarness accountActive={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole("button", { name: "Account actions" }),
    );

    await expect(
      screen.getByRole("menuitem", { name: "Unarchive" }),
    ).toBeVisible();
    await expect(
      screen.getByRole("menuitem", { name: "Delete" }),
    ).toBeVisible();
  },
};

export const DisabledAccountActionsMenu: Story = {
  render: () => <LedgerPageStoryHarness accountActionsDisabled={true} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole("button", { name: "Account actions" }),
    );

    await expect(
      screen.getByRole("menuitem", { name: "Archive" }),
    ).toBeVisible();
    await expect(
      screen.getByRole("menuitem", { name: "Delete" }),
    ).toBeVisible();
  },
};

export const SimpleModalState: Story = {
  render: () => <LedgerPageStoryHarness startWithSimpleModal={true} />,
};

export const SplitModalState: Story = {
  render: () => <LedgerPageStoryHarness startWithSplitModal={true} />,
};

export const EditModalState: Story = {
  render: () => <LedgerPageStoryHarness startWithEditModal={true} />,
};

export const PeriodFilterRouteSmoke: Story = {
  render: () => (
    <LedgerPageStoryHarness
      routeSmoke={true}
      includePeriodFilterControls={true}
      accountType={AccountType.EQUITY}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByTestId("router-search-period")).toHaveTextContent(
      "(none)",
    );
    await expect(
      canvas.getByRole("button", { name: "Clear filter" }),
    ).toBeDisabled();

    await userEvent.click(canvas.getByRole("radio", { name: "Year" }));
    await expect(canvas.getByTestId("router-search-period")).toHaveTextContent(
      "(none)",
    );

    await userEvent.click(canvas.getByRole("radio", { name: "Month" }));
    await expect(canvas.getByTestId("router-search-period")).toHaveTextContent(
      "(none)",
    );

    await userEvent.click(canvas.getByRole("button", { name: "All periods" }));
    await userEvent.click(canvas.getByRole("button", { name: /Feb/i }));

    await expect(canvas.getByTestId("router-search-period")).toHaveTextContent(
      "2026-02",
    );

    await userEvent.click(
      canvas.getByRole("button", { name: "Previous period" }),
    );
    await expect(canvas.getByTestId("router-search-period")).toHaveTextContent(
      "2026-01",
    );

    await userEvent.click(canvas.getByRole("button", { name: "Clear filter" }));
    await expect(canvas.getByTestId("router-search-period")).toHaveTextContent(
      "(none)",
    );
  },
};
