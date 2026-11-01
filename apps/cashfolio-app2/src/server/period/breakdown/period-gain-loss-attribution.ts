import type { GainLossContributionAccumulator } from "./period-gains-losses-contributions";

import type { PeriodBaseData } from "../base-data/period-base-data-types";
import { getAssetClassLabel } from "../../../shared/asset-class";
import {
  getGainLossInvestmentGroup,
  type GainLossInvestmentGroup,
} from "../../../shared/investment-group";

export type GainLossAccountAttribution = {
  assetClassId: string | null;
  kind: "account" | "transferClearing" | "unattributed";
  explanation: string | null;
  instrumentLabel?: string;
  investmentGroup?: GainLossInvestmentGroup;
};

/** Current classification is independent of valuation and FIFO identity. */
export function buildGainLossAccountAttribution(
  baseData: Pick<
    PeriodBaseData,
    | "assetClasses"
    | "baseAssetLiabilityAccounts"
    | "transferClearingUnitBuckets"
    | "executionResidualTransactions"
  >,
  contributions: Pick<
    GainLossContributionAccumulator,
    "accountId" | "originatingAccountIds"
  >[] = [],
): Map<string, GainLossAccountAttribution> {
  const accounts = new Map(
    baseData.baseAssetLiabilityAccounts.map((account) => [account.id, account]),
  );
  const result = new Map<string, GainLossAccountAttribution>();
  for (const account of accounts.values()) {
    result.set(account.id, {
      assetClassId: account.assetClassId ?? null,
      kind: "account",
      explanation: null,
      investmentGroup: getGainLossInvestmentGroup(account),
      instrumentLabel: [
        account.currency,
        account.cryptocurrency,
        account.symbol,
        account.tradeCurrency,
      ]
        .filter(Boolean)
        .join(" / "),
    });
  }
  const originating = (
    ids: Set<string>,
    kind: GainLossAccountAttribution["kind"],
  ): GainLossAccountAttribution => {
    const account = ids.size === 1 ? accounts.get([...ids][0]) : undefined;
    return {
      assetClassId: account?.assetClassId ?? null,
      kind,
      explanation: account
        ? `Grouped under ${getAssetClassLabel(account.assetClassId, baseData.assetClasses)} based on the originating account: ${account.name}.`
        : "No single originating asset/liability account can be established; the amount remains Unclassified.",
    };
  };
  for (const bucket of baseData.transferClearingUnitBuckets) {
    result.set(`virtual:transfer-clearing:account:${bucket.unitKey}`, {
      ...originating(
        new Set(
          bucket.bookings.flatMap((booking) =>
            booking.originatingAccountIds?.length
              ? booking.originatingAccountIds
              : ["unknown"],
          ),
        ),
        "transferClearing",
      ),
      investmentGroup: getGainLossInvestmentGroup(bucket),
    });
  }
  const residualOrigins = new Map<string, Set<string>>();
  for (const contribution of contributions) {
    if (
      accounts.has(contribution.accountId) ||
      !contribution.originatingAccountIds
    )
      continue;
    const origins = residualOrigins.getOrInsertComputed(
      contribution.accountId,
      () => new Set<string>(),
    );
    for (const id of contribution.originatingAccountIds.length
      ? contribution.originatingAccountIds
      : ["unknown"])
      origins.add(id);
  }
  for (const [id, origins] of residualOrigins)
    result.set(id, originating(origins, "unattributed"));
  return result;
}
