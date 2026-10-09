import {
  getBookingPeriodValue,
  getLatestBookingDate,
} from "@/shared/transaction-period";
import { AccountType } from "@/.prisma-client/enums";
import { moneyAdd, moneyIsZero, toMoney, toMoneyNumber } from "@/shared/money";
import type { LedgerSearch } from "./-page-types";
import type { TransactionMutationValues } from "./-page-view";
import type {
  StatementImportDraft,
  StatementImportDraftStatus,
} from "./-statement-import";

export const STATEMENT_IMPORT_BALANCE_CARRIED_FORWARD_ROW_ID =
  "__statement_import_balance_carried_forward__";

export type StatementImportReviewDraftRow = StatementImportDraft & {
  rowType?: "draft";
  balance: number;
};

export type StatementImportBalanceCarriedForwardRow = {
  id: typeof STATEMENT_IMPORT_BALANCE_CARRIED_FORWARD_ROW_ID;
  rowType: "balanceCarriedForward";
  ignored?: false;
  date?: undefined;
  amount?: undefined;
  originalAmount?: undefined;
  originalCurrency?: undefined;
  counterAccountId?: undefined;
  description: "Balance carried forward";
  balance: number;
};

export type StatementImportGridRow =
  StatementImportReviewDraftRow | StatementImportBalanceCarriedForwardRow;

export function getStatementImportSuccessLedgerSearch(args: {
  selectedPeriodValue?: string;
  transactions: TransactionMutationValues[];
  createdTransactions: { id: string }[];
}): LedgerSearch {
  const latestImportedTransaction = args.transactions.reduce<{
    date: Date;
    index: number;
  } | null>((latest, transaction, index) => {
    const nextDate = getLatestBookingDate(transaction.bookings);
    if (!nextDate) return latest;
    if (!latest || nextDate > latest.date) {
      return { date: nextDate, index };
    }
    return latest;
  }, null);
  const latestBookingDate = latestImportedTransaction?.date ?? null;
  const transactionId =
    args.selectedPeriodValue && latestImportedTransaction
      ? (args.createdTransactions[latestImportedTransaction.index]?.id ??
        args.createdTransactions.at(-1)?.id)
      : args.createdTransactions.at(-1)?.id;
  const period =
    args.selectedPeriodValue && latestBookingDate
      ? getBookingPeriodValue({
          date: latestBookingDate,
          currentPeriodValue: args.selectedPeriodValue,
        })
      : args.selectedPeriodValue;

  return {
    period,
    transactionId,
  };
}

export function getStatementImportIncludedDrafts(
  drafts: StatementImportDraft[],
): StatementImportDraft[] {
  return drafts.filter((draft) => !draft.ignored);
}

export function isStatementImportReviewDraftRow(
  row: StatementImportGridRow | undefined,
): row is StatementImportReviewDraftRow {
  return !!row && row.rowType !== "balanceCarriedForward";
}

export function getStatementImportDisplayBalanceValue(args: {
  account: { type: AccountType };
  rawValue: number;
}): number {
  return toMoneyNumber(
    shouldNegateStatementImportBalance(args.account.type)
      ? toMoney(args.rawValue).neg()
      : toMoney(args.rawValue),
  );
}

export function getStatementImportReviewRows(args: {
  account: { type: AccountType };
  persistedBalance: number;
  drafts: StatementImportDraft[];
}): StatementImportReviewDraftRow[] {
  const negate = shouldNegateStatementImportBalance(args.account.type);
  let runningBalance = toMoney(
    getStatementImportDisplayBalanceValue({
      account: args.account,
      rawValue: args.persistedBalance,
    }),
  );
  const rows = new Array<StatementImportReviewDraftRow>(args.drafts.length);

  for (let index = args.drafts.length - 1; index >= 0; index -= 1) {
    const draft = args.drafts[index];
    if (!draft) continue;

    if (!draft.ignored) {
      const currentAccountValue = getStatementImportCurrentAccountValue(draft);
      const signedCurrentAccountValue = negate
        ? currentAccountValue.neg()
        : currentAccountValue;
      runningBalance = moneyAdd(runningBalance, signedCurrentAccountValue);
    }

    rows[index] = {
      ...draft,
      rowType: "draft",
      balance: toMoneyNumber(runningBalance),
    };
  }

  return rows;
}

export function getStatementImportBalanceCarriedForwardRow(args: {
  account: { type: AccountType };
  persistedBalance: number;
}): StatementImportBalanceCarriedForwardRow | undefined {
  const balance = getStatementImportDisplayBalanceValue({
    account: args.account,
    rawValue: args.persistedBalance,
  });

  if (moneyIsZero(balance)) {
    return undefined;
  }

  return {
    id: STATEMENT_IMPORT_BALANCE_CARRIED_FORWARD_ROW_ID,
    rowType: "balanceCarriedForward",
    description: "Balance carried forward",
    balance,
  };
}

export function getStatementImportGridRows(args: {
  account: { type: AccountType };
  persistedBalance: number;
  drafts: StatementImportDraft[];
}): StatementImportGridRow[] {
  const reviewRows = getStatementImportReviewRows(args);
  const balanceCarriedForwardRow =
    getStatementImportBalanceCarriedForwardRow(args);

  return balanceCarriedForwardRow
    ? [...reviewRows, balanceCarriedForwardRow]
    : reviewRows;
}

export function getStatementImportReadyCount(args: {
  drafts: StatementImportDraft[];
  statuses: Map<string, StatementImportDraftStatus>;
}): number {
  return getStatementImportIncludedDrafts(args.drafts).filter(
    (draft) => args.statuses.get(draft.id)?.kind === "ready",
  ).length;
}

export function getStatementImportIgnoredCount(
  drafts: StatementImportDraft[],
): number {
  return drafts.length - getStatementImportIncludedDrafts(drafts).length;
}

export function getStatementImportSummaryText(args: {
  drafts: StatementImportDraft[];
  readyCount: number;
  ignoredCount: number;
}): string {
  if (args.drafts.length === 0) {
    return "No statement loaded";
  }

  const ignoredSuffix =
    args.ignoredCount > 0 ? `, ${args.ignoredCount} ignored` : "";
  return `${args.readyCount} of ${args.drafts.length} ready${ignoredSuffix}`;
}

export function getStatementImportBulkIgnoredActionLabel(args: {
  shouldIgnore: boolean;
  selectedDraftCount: number;
}): string {
  const action = args.shouldIgnore ? "Ignore" : "Unignore";
  const rowLabel = args.selectedDraftCount === 1 ? "row" : "rows";
  return `${action} ${args.selectedDraftCount} selected ${rowLabel}`;
}

export function getStatementImportTransactionsToSubmit(
  drafts: StatementImportDraft[],
): TransactionMutationValues[] {
  return getStatementImportIncludedDrafts(drafts).map(
    (draft) => draft.transaction,
  );
}

export function isStatementImportDisabled(args: {
  drafts: StatementImportDraft[];
  readyCount: number;
  isSubmitting: boolean;
  isEditSubmitting: boolean;
}): boolean {
  const includedDrafts = getStatementImportIncludedDrafts(args.drafts);
  return (
    args.isSubmitting ||
    args.isEditSubmitting ||
    includedDrafts.length === 0 ||
    args.readyCount !== includedDrafts.length
  );
}

export function toggleStatementImportDraftIgnored(
  drafts: StatementImportDraft[],
  draftId: string,
): StatementImportDraft[] {
  return drafts.map((draft) =>
    draft.id === draftId ? { ...draft, ignored: !draft.ignored } : draft,
  );
}

export function setStatementImportDraftsIgnored(args: {
  drafts: StatementImportDraft[];
  draftIds: string[];
  ignored: boolean;
}): StatementImportDraft[] {
  const draftIds = new Set(args.draftIds);
  return args.drafts.map((draft) => {
    if (!draftIds.has(draft.id) || draft.ignored === args.ignored) {
      return draft;
    }

    return {
      ...draft,
      ignored: args.ignored,
    };
  });
}

function shouldNegateStatementImportBalance(type: AccountType): boolean {
  return type === AccountType.LIABILITY;
}

function getStatementImportCurrentAccountValue(draft: StatementImportDraft) {
  return draft.transaction.bookings
    .filter((booking) => booking.accountId === draft.currentAccountId)
    .reduce((sum, booking) => moneyAdd(sum, booking.value), toMoney(0));
}
