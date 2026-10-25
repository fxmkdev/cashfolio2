import type { GainLossContributionAccumulator } from "./period-gains-losses-contributions";
import type { AssetClass } from "../../../.prisma-client/enums";
import type { PeriodBaseData } from "../base-data/period-base-data-types";

export type GainLossAccountAttribution = {
  assetClass: AssetClass | null;
  kind: "account" | "transferClearing" | "unattributed";
  explanation: string | null;
  instrumentLabel?: string;
};

/** Current classification is independent of valuation and FIFO identity. */
export function buildGainLossAccountAttribution(
  baseData: Pick<
    PeriodBaseData,
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
      assetClass: account.assetClass ?? null,
      kind: "account",
      explanation: null,
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
      assetClass: account?.assetClass ?? null,
      kind,
      explanation: account
        ? `Attributed to the originating account ${account.name}.`
        : "No single originating asset/liability account can be established; the amount remains Unclassified.",
    };
  };
  for (const bucket of baseData.transferClearingUnitBuckets) {
    result.set(
      `virtual:transfer-clearing:account:${bucket.unitKey}`,
      originating(
        new Set(
          bucket.bookings.flatMap((booking) =>
            booking.originatingAccountIds?.length
              ? booking.originatingAccountIds
              : ["unknown"],
          ),
        ),
        "transferClearing",
      ),
    );
  }
  const residualOrigins = new Map<string, Set<string>>();
  for (const contribution of contributions) {
    if (
      accounts.has(contribution.accountId) ||
      !contribution.originatingAccountIds
    )
      continue;
    const origins =
      residualOrigins.get(contribution.accountId) ?? new Set<string>();
    for (const id of contribution.originatingAccountIds.length
      ? contribution.originatingAccountIds
      : ["unknown"])
      origins.add(id);
    residualOrigins.set(contribution.accountId, origins);
  }
  for (const [id, origins] of residualOrigins)
    result.set(id, originating(origins, "unattributed"));
  return result;
}
