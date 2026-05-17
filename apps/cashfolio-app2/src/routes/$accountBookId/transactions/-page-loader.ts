import { getAccounts } from "@/server/accounts";
import { getTransactionsData } from "@/server/transactions-data";
import { getLedgerPeriodBounds } from "@/server/ledger";

export async function loadTransactionsPageData(args: {
  accountBookId: string;
  period?: string;
}) {
  const [transactionsData, accounts, periodBounds] = await Promise.all([
    getTransactionsData({
      data: {
        accountBookId: args.accountBookId,
        period: args.period,
      },
    }),
    getAccounts({
      data: { accountBookId: args.accountBookId },
    }),
    getLedgerPeriodBounds({
      data: {
        accountBookId: args.accountBookId,
      },
    }),
  ]);

  return {
    rows: transactionsData.rows,
    referenceCurrency: transactionsData.referenceCurrency,
    accounts,
    periodBounds,
  };
}
