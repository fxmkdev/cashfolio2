import {
  aggregateAccountGainLoss,
  EMPTY_GAIN_LOSS_SUMMARY,
  type AccountGainLossSummaries,
  type AccountGainLossResult,
} from "@/shared/account-gain-loss";
import { toMoneyNumber, type MoneyInput } from "@/shared/money";
import type { TreeRow } from "./-page-types";

function numericResult(
  result: AccountGainLossResult<MoneyInput>,
): AccountGainLossResult {
  const numericAmount = (amount: MoneyInput | null) =>
    amount == null ? null : toMoneyNumber(amount);
  return {
    ...result,
    summary: {
      realizedGainLoss: numericAmount(result.summary.realizedGainLoss),
      unrealizedGainLoss: numericAmount(result.summary.unrealizedGainLoss),
      totalGainLoss: numericAmount(result.summary.totalGainLoss),
    },
  };
}

/** Keep decimal subtotals throughout the tree; convert only final display rows. */
export function projectAssetClassGainLoss(
  data: AccountGainLossSummaries | undefined,
  rows: TreeRow[],
): AccountGainLossSummaries | undefined {
  if (!data) return undefined;
  const byId = new Map(data.rows.map((row) => [row.id, row]));
  const children = new Map<string, TreeRow[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    const siblings = children.get(row.parentId) ?? [];
    siblings.push(row);
    children.set(row.parentId, siblings);
  }
  const results = new Map<string, AccountGainLossResult<MoneyInput>>();
  const summarize = (row: TreeRow): AccountGainLossResult<MoneyInput> => {
    const cached = results.get(row.id);
    if (cached) return cached;
    if (row.nodeType === "account")
      return (
        byId.get(row.id) ?? {
          applicable: true,
          summary: EMPTY_GAIN_LOSS_SUMMARY,
          diagnostics: [
            { date: data.asOfDate, message: "Gain/loss is unavailable." },
          ],
        }
      );
    const result = aggregateAccountGainLoss(
      (children.get(row.id) ?? []).map(summarize),
    );
    results.set(row.id, result);
    return result;
  };
  return {
    ...data,
    rows: rows.map((row) => ({ id: row.id, ...numericResult(summarize(row)) })),
  };
}
