import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "@/.prisma-client/enums";
import {
  getAccountGroups,
  getAccountNavigationGroups,
  getAccounts,
  getExistingNodes,
  getLedgerAccountActionData,
} from "@/server/accounts";
import {
  getAccountForLedger,
  getLedgerData,
  getLedgerPeriodBounds,
} from "@/server/ledger";
import { getAccountRecordedGainLossEligibility } from "@/server/account-gain-loss";

export function isLedgerPeriodFilterAvailable(account: {
  type: AccountType;
  equityAccountSubtype: EquityAccountSubtype | null;
}) {
  return (
    account.type === AccountType.BALANCE ||
    (account.type === AccountType.EQUITY &&
      account.equityAccountSubtype !== EquityAccountSubtype.OPENING_BALANCES)
  );
}

export async function loadLedgerPageData(args: {
  accountBookId: string;
  accountId: string;
  period?: string;
}) {
  // Observe both lookups immediately: a missing book can reject both.
  const [account, accounts] = await Promise.all([
    getAccountForLedger({
      data: { accountId: args.accountId, accountBookId: args.accountBookId },
    }),
    getAccounts({
      data: { accountBookId: args.accountBookId },
    }),
  ]);
  const accountState = account.isActive ? "active" : "inactive";
  const isPeriodFilterAllowed = isLedgerPeriodFilterAvailable(account);
  const shouldIncludeReferenceValues =
    isPeriodFilterAllowed && account.type === AccountType.EQUITY;
  const shouldIncludeFirstBookingDate = account.type === AccountType.BALANCE;
  const [
    ledgerData,
    periodBounds,
    accountTreeRow,
    accountGroups,
    existingNodes,
    navigationGroups,
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
    getLedgerPeriodBounds({
      data: {
        accountBookId: args.accountBookId,
        accountId: args.accountId,
      },
    }),
    getLedgerAccountActionData({
      data: {
        accountBookId: args.accountBookId,
        accountId: args.accountId,
      },
    }),
    getAccountGroups({
      data: { accountBookId: args.accountBookId, accountState },
    }),
    getExistingNodes({
      data: { accountBookId: args.accountBookId, accountState },
    }),
    account.type === AccountType.BALANCE
      ? getAccountNavigationGroups({
          data: { accountBookId: args.accountBookId },
        })
      : Promise.resolve([]),
  ]);

  const isReferenceCurrencyBalanceAccount =
    account.type === AccountType.BALANCE &&
    account.unit === Unit.CURRENCY &&
    account.currency?.toUpperCase() ===
      ledgerData.referenceCurrency.toUpperCase();
  const hasRecordedGainLoss =
    isReferenceCurrencyBalanceAccount &&
    (await getAccountRecordedGainLossEligibility({
      data: {
        accountBookId: args.accountBookId,
        accountId: args.accountId,
        period: args.period,
      },
    }));
  return {
    account,
    accountTreeRow,
    accountGroups,
    existingNodes,
    navigationGroups,
    rows: ledgerData.rows,
    referenceCurrency: ledgerData.referenceCurrency,
    showGainLoss:
      account.type === AccountType.BALANCE &&
      (hasRecordedGainLoss ||
        !(
          account.unit === Unit.CURRENCY &&
          account.currency?.toUpperCase() ===
            ledgerData.referenceCurrency.toUpperCase()
        )),
    firstBookingDate: ledgerData.firstBookingDate,
    balanceBeforePeriod: ledgerData.balanceBeforePeriod,
    hasBookingsBeforePeriod: ledgerData.hasBookingsBeforePeriod,
    accounts,
    periodBounds,
  };
}
