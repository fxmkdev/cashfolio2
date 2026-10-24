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
  for (const transaction of baseData.executionResidualTransactions) {
    const ids = transaction.bookings
      .filter((booking) => accounts.has(booking.accountId))
      .map((booking) => booking.accountId);
    for (const booking of transaction.bookings) {
      if (accounts.has(booking.accountId)) continue;
      const origins =
        residualOrigins.get(booking.accountId) ?? new Set<string>();
      // An unattributed transaction must not be hidden by an attributable one.
      for (const id of ids.length ? ids : ["unknown"]) origins.add(id);
      residualOrigins.set(booking.accountId, origins);
    }
  }
  for (const [id, origins] of residualOrigins)
    result.set(id, originating(origins, "unattributed"));
  return result;
}
