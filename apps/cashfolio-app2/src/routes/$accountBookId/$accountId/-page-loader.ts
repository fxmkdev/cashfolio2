import { AccountType, EquityAccountSubtype } from "@/.prisma-client/enums";
import { getAccounts } from "@/server/accounts";
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

  const [ledgerData, accounts, periodBounds] = await Promise.all([
    getLedgerData({
      data: {
        accountId: args.accountId,
        accountBookId: args.accountBookId,
        period: isPeriodFilterAllowed ? args.period : undefined,
        includeReferenceValues: shouldIncludeReferenceValues,
      },
    }),
    accountsPromise,
    getLedgerPeriodBounds({
      data: {
        accountBookId: args.accountBookId,
      },
    }),
  ]);

  return {
    account,
    bookings: ledgerData.bookings,
    referenceCurrency: ledgerData.referenceCurrency,
    firstBookingDate: ledgerData.firstBookingDate,
    balanceBeforePeriod: ledgerData.balanceBeforePeriod,
    hasBookingsBeforePeriod: ledgerData.hasBookingsBeforePeriod,
    accounts,
    periodBounds,
  };
}
