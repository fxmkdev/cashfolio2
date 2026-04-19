import { AccountType } from "@/.prisma-client/enums";
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
  const account = await getAccountForLedger({
    data: { accountId: args.accountId, accountBookId: args.accountBookId },
  });
  const isPeriodFilterAllowed = account.type === AccountType.EQUITY;

  const [bookings, accounts, periodBounds] = await Promise.all([
    getLedgerData({
      data: {
        accountId: args.accountId,
        accountBookId: args.accountBookId,
        period: isPeriodFilterAllowed ? args.period : undefined,
      },
    }),
    getAccounts({ data: { accountBookId: args.accountBookId } }),
    getLedgerPeriodBounds({
      data: { accountId: args.accountId, accountBookId: args.accountBookId },
    }),
  ]);

  return { account, bookings, accounts, periodBounds };
}
