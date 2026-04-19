import { getAccounts } from "@/server/accounts";
import { getAccountForLedger, getLedgerData } from "@/server/ledger";

export async function loadLedgerPageData(args: {
  accountBookId: string;
  accountId: string;
}) {
  const [account, bookings, accounts] = await Promise.all([
    getAccountForLedger({
      data: { accountId: args.accountId, accountBookId: args.accountBookId },
    }),
    getLedgerData({
      data: { accountId: args.accountId, accountBookId: args.accountBookId },
    }),
    getAccounts({ data: { accountBookId: args.accountBookId } }),
  ]);

  return { account, bookings, accounts };
}
