import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "@/.prisma-client/enums";
import { accountOptions as baseAccountOptions } from "@/components/testing/storybook-fixtures";
import type { StatementImportCsvFormat } from "@/shared/statement-import-csv-format";
import { getStatementImportDisabledReason } from "../-statement-import/draft/account-options";
import type { LedgerRow } from "./page-types";
import type {
  LedgerPageViewProps,
  SplitModalInitialValues,
} from "./page-view.types";
export const statementImportCsvFormat: StatementImportCsvFormat = {
  hasHeader: true,
  delimitersToGuess: [",", ";"],
  columns: [
    "date",
    "amount",
    "original amount",
    "original currency",
    "exchange rate",
    "description",
  ],
  dateFormat: "yyyy-MM-dd",
  numberFormat: {
    decimalSeparator: ".",
  },
};

export const assetAccount = {
  assetClassId: null,
  trackingMethod: "INDIVIDUAL_UNITS" as const,

  id: "account-checking",
  name: "Checking",
  isActive: true,
  type: AccountType.BALANCE,
  equityAccountSubtype: null,
  unit: Unit.CURRENCY,
  currency: "CHF",
  cryptocurrency: null,
  symbol: null,
  tradeCurrency: null,
  statementImportCsvFormat,
  isCashAccount: true,
  groupPathSegments: ["Assets", "Cash"],
};

export const rows: LedgerRow[] = [
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

export const createSplitInitialValues: SplitModalInitialValues = {
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

export type LedgerPageStoryOptions = {
  routeSmoke?: boolean;
  includePeriodFilterControls?: boolean;
  accountType?: AccountType;
  startWithSimpleModal?: boolean;
  startWithSplitModal?: boolean;
  startWithEditModal?: boolean;
  accountActive?: boolean;
  accountActionsDisabled?: boolean;
  equitySubtype?: EquityAccountSubtype;
  returnLabel?: string;
  assetClassId?: string | null;
  hasStatementImportCsvFormat?: boolean;
  accountEditDisabledReason?: string;
  onOpenImportPage?: () => void;
  accountName?: string;
  groupPathSegments?: string[];
};

export function createLedgerStoryAccount(
  options: LedgerPageStoryOptions,
): LedgerPageViewProps["account"] {
  const { accountType = AccountType.BALANCE, equitySubtype } = options;
  return accountType === AccountType.EQUITY
    ? {
        ...assetAccount,
        id: "account-equity",
        name:
          options.accountName ??
          (equitySubtype === EquityAccountSubtype.EXPENSE
            ? "Groceries"
            : equitySubtype === EquityAccountSubtype.INCOME
              ? "Salary"
              : "System Activity"),
        equityAccountSubtype: equitySubtype ?? null,
        isActive: options.accountActive ?? true,
        type: AccountType.EQUITY,
        isCashAccount: false,
        groupPathSegments: ["Equity"],
      }
    : {
        ...assetAccount,
        name: options.accountName ?? assetAccount.name,
        groupPathSegments:
          options.groupPathSegments ?? assetAccount.groupPathSegments,
        type: accountType,
        isActive: options.accountActive ?? true,
        assetClassId: options.assetClassId ?? null,
        statementImportCsvFormat:
          (options.hasStatementImportCsvFormat ?? true)
            ? statementImportCsvFormat
            : null,
      };
}

export function getLedgerStoryViewData(
  account: LedgerPageViewProps["account"],
  options: LedgerPageStoryOptions,
) {
  const disabled = options.accountActionsDisabled ?? false;
  return {
    backTab: "BALANCE",
    account,
    accountGroups: [],
    existingNodes: [],
    rows,
    currentAccountLabel: "Checking",
    unitLabel: "CHF",
    accountBookStartDate: new Date("2026-01-04T00:00:00.000Z"),
    simpleTransactionDisabledReason: null,
    accountEditDisabledReason: options.accountEditDisabledReason,
    accountEditInitialValues: {
      assetClassId: account.assetClassId,
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
    },
    createSplitInitialValues,
    hasCompleteBookingUnit: true,
    unitUsage: { currencies: ["CHF", "EUR", "USD"], cryptocurrencies: ["BTC"] },
    accountOptions: baseAccountOptions,
    editAccountOptions: baseAccountOptions,
    simpleCounterAccountOptions: baseAccountOptions,
    editSimpleCounterAccountOptions: baseAccountOptions,
    rebookTargetAccountOptions: [
      { value: "account-groceries", label: "Groceries (Expense)" },
    ],
    accountArchivable: account.isActive && !disabled,
    accountArchiveLabel: disabled
      ? "Cannot archive account because its current or scheduled balance is not 0"
      : "Archive",
    accountUnarchivable: !account.isActive && !disabled,
    accountUnarchiveLabel: disabled
      ? "Cannot unarchive account because its parent group is archived"
      : "Unarchive",
    accountDeletable: !disabled,
    accountDeleteLabel: disabled
      ? "Cannot delete account because it has bookings"
      : "Delete",
    statementImportDisabledReason: getStatementImportDisabledReason(account),
    onRowDataUpdated: () => undefined,
    onOpenImportPage: options.onOpenImportPage ?? (() => undefined),
  } satisfies Partial<LedgerPageViewProps>;
}
