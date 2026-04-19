import { getAccounts } from "@/server/accounts";
import {
  getAccountForLedger,
  getLedgerData,
  getLedgerPeriodBounds,
} from "@/server/ledger";

export async function loadLedgerPageData(args: {
  accountBookId: string;
  accountId: string;
  period?: string;
}) {
  const [account, bookings, accounts, periodBounds] = await Promise.all([
    getAccountForLedger({
      data: { accountId: args.accountId, accountBookId: args.accountBookId },
    }),
    getLedgerData({
      data: {
        accountId: args.accountId,
        accountBookId: args.accountBookId,
        period: args.period,
      },
    }),
    getAccounts({ data: { accountBookId: args.accountBookId } }),
    getLedgerPeriodBounds({
      data: { accountId: args.accountId, accountBookId: args.accountBookId },
    }),
  ]);

  return { account, bookings, accounts, periodBounds };
}
