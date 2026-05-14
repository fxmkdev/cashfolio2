import { getAccounts } from "@/server/accounts";
import { getActivityData } from "@/server/activity";
import { getLedgerPeriodBounds } from "@/server/ledger";

export async function loadActivityPageData(args: {
  accountBookId: string;
  period?: string;
}) {
  const [activityData, accounts, periodBounds] = await Promise.all([
    getActivityData({
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
    rows: activityData.rows,
    referenceCurrency: activityData.referenceCurrency,
    accounts,
    periodBounds,
  };
}
