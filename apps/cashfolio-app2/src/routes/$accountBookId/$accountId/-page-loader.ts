import { AccountType, EquityAccountSubtype } from "@/.prisma-client/enums";
import {
  getAccountGroups,
  getAccounts,
  getAccountTreeData,
  getExistingNodes,
} from "@/server/accounts";
import {
  getAccountForLedger,
  getLedgerData,
  getLedgerPeriodBounds,
} from "@/server/ledger";

export function isLedgerPeriodFilterAvailable(account: {
  type: AccountType;
  equityAccountSubtype: EquityAccountSubtype | null;
}) {
  return (
    account.type === AccountType.ASSET ||
    account.type === AccountType.LIABILITY ||
    (account.type === AccountType.EQUITY &&
      account.equityAccountSubtype !== EquityAccountSubtype.OPENING_BALANCES)
  );
}

export async function loadLedgerPageData(args: {
  accountBookId: string;
  accountId: string;
  period?: string;
}) {
  const accountPromise = getAccountForLedger({
    data: { accountId: args.accountId, accountBookId: args.accountBookId },
  });
  const accountsPromise = getAccounts({
    data: { accountBookId: args.accountBookId },
  });
  const account = await accountPromise;
  const isPeriodFilterAllowed = isLedgerPeriodFilterAvailable(account);
  const shouldIncludeReferenceValues =
    isPeriodFilterAllowed && account.type === AccountType.EQUITY;
  const shouldIncludeFirstBookingDate =
    account.type === AccountType.ASSET ||
    account.type === AccountType.LIABILITY;
  const accountState = account.isActive ? "active" : "inactive";

  const [
    ledgerData,
    accounts,
    periodBounds,
    accountTreeData,
    accountGroups,
    existingNodes,
  ] = await Promise.all([
    getLedgerData({
      data: {
        accountId: args.accountId,
        accountBookId: args.accountBookId,
        period: isPeriodFilterAllowed ? args.period : undefined,
        includeReferenceValues: shouldIncludeReferenceValues,
        includeFirstBookingDate: shouldIncludeFirstBookingDate,
        accountType: account.type,
        accountEquityAccountSubtype: account.equityAccountSubtype,
        accountUnit: account.unit,
        accountCurrency: account.currency,
        accountCryptocurrency: account.cryptocurrency,
        accountSymbol: account.symbol,
        accountTradeCurrency: account.tradeCurrency,
      },
    }),
    accountsPromise,
    getLedgerPeriodBounds({
      data: {
        accountBookId: args.accountBookId,
      },
    }),
    getAccountTreeData({
      data: {
        accountBookId: args.accountBookId,
        accountState,
        type: account.type,
        equityAccountSubtype: account.equityAccountSubtype ?? undefined,
        includeReferenceBalances: false,
      },
    }),
    getAccountGroups({
      data: { accountBookId: args.accountBookId },
    }),
    getExistingNodes({
      data: { accountBookId: args.accountBookId },
    }),
  ]);
  const accountTreeRow = accountTreeData.rows.find(
    (row) => row.nodeType === "account" && row.id === args.accountId,
  );
  if (!accountTreeRow) {
    throw new Error("Ledger account action data could not be loaded");
  }

  return {
    account,
    accountTreeRow,
    accountGroups,
    existingNodes,
    rows: ledgerData.rows,
    referenceCurrency: ledgerData.referenceCurrency,
    firstBookingDate: ledgerData.firstBookingDate,
    balanceBeforePeriod: ledgerData.balanceBeforePeriod,
    hasBookingsBeforePeriod: ledgerData.hasBookingsBeforePeriod,
    accounts,
    periodBounds,
  };
}
