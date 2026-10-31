import { getPeriodHistory } from "@/server/period-history";
import { fetchWithResourceErrors } from "@/shared/resource-fetch";
import type { HistoryBatchRequest } from "./-history-loading";

export async function loadHistoryBatch(args: HistoryBatchRequest) {
  return getPeriodHistory({
    signal: args.signal,
    fetch: fetchWithResourceErrors,
    data: {
      accountBookId: args.accountBookId,
      before: args.before,
      pageSize: args.pageSize,
      granularity: args.mode,
      scopedMetric: args.scopedMetric,
      cashFlowScope: args.cashFlowScope,
      incomeScope: args.incomeScope,
      expenseScope: args.expenseScope,
      gainLossScope: args.gainLossScope,
      netWorthScope: args.netWorthScope,
      locale: args.locale,
    },
  });
}
