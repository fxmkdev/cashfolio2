import { getLegacyHoldingGainLossScope } from "../../../shared/history-scope";
import { toMoney, type Money, moneyAdd, moneySum } from "../../../shared/money";
import type { Unit } from "../../../.prisma-client/enums";

import { round2 } from "../period-helpers";
import { assetClassOptions } from "../../../shared/asset-class";
import type { GainLossAccountAttribution } from "./period-gain-loss-attribution";

export type PeriodGainsLossesContribution = {
  sourceKind: "HOLDING" | "EXPLICIT";
  accountId: string;
  accountName: string;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  realizedGainLoss: Money;
  unrealizedGainLoss: Money;
};

export type PeriodGainsLossesBreakdownNode = {
  id: string;
  label: string;
  realizedGainLoss: Money;
  unrealizedGainLoss: Money;
  totalGainLoss: Money;
  children: PeriodGainsLossesBreakdownNode[];
  account?: GainLossAccountAttribution & {
    id: string;
    legacyScopes: string[];
    sources: Array<PeriodGainsLossesContribution["sourceKind"]>;
    instrumentLabel: string;
    calculatedRealizedGainLoss: Money;
    calculatedUnrealizedGainLoss: Money;
    recordedGainLoss: Money;
  };
};

function totals(realizedGainLoss: Money, unrealizedGainLoss: Money) {
  return {
    realizedGainLoss: round2(realizedGainLoss),
    unrealizedGainLoss: round2(unrealizedGainLoss),
    totalGainLoss: round2(moneyAdd(realizedGainLoss, unrealizedGainLoss)),
  };
}

export function buildGainsLossesBreakdown(args: {
  contributions: PeriodGainsLossesContribution[];
  referenceCurrency: string;
  accountAttributionById?: ReadonlyMap<string, GainLossAccountAttribution>;
}): { hierarchy: PeriodGainsLossesBreakdownNode[] } {
  const byAccount = new Map<string, PeriodGainsLossesContribution[]>();
  for (const contribution of args.contributions) {
    if (
      toMoney(contribution.realizedGainLoss).isZero() &&
      toMoney(contribution.unrealizedGainLoss).isZero()
    )
      continue;
    const values = byAccount.get(contribution.accountId) ?? [];
    values.push(contribution);
    byAccount.set(contribution.accountId, values);
  }
  const classes = [
    ...assetClassOptions,
    { value: "unclassified", label: "Unclassified" },
  ];
  const hierarchy: PeriodGainsLossesBreakdownNode[] = [];
  for (const descriptor of classes) {
    const contributions: PeriodGainsLossesContribution[] = [];
    const children: PeriodGainsLossesBreakdownNode[] = [];
    for (const [accountId, values] of byAccount) {
      const attribution = args.accountAttributionById?.get(accountId) ?? {
        assetClass: null,
        kind: "unattributed" as const,
        explanation:
          "No single originating asset/liability account can be established; the amount remains Unclassified.",
      };
      if ((attribution.assetClass ?? "unclassified") !== descriptor.value)
        continue;
      contributions.push(...values);
      const first = values[0]!;
      const calculated = values.filter(
        (value) => value.sourceKind === "HOLDING",
      );
      const recorded = values.filter(
        (value) => value.sourceKind === "EXPLICIT",
      );
      children.push({
        id: `gain-loss-account:${accountId}`,
        label: first.accountName,
        ...totals(
          moneySum(values.map((value) => value.realizedGainLoss)),
          moneySum(values.map((value) => value.unrealizedGainLoss)),
        ),
        account: {
          ...attribution,
          id: accountId,
          legacyScopes: values.map((value) =>
            value.sourceKind === "EXPLICIT"
              ? `explicit-account:${accountId}`
              : getLegacyHoldingGainLossScope({ ...value, id: accountId }),
          ),
          sources: [...new Set(values.map((value) => value.sourceKind))],
          instrumentLabel:
            attribution.instrumentLabel ??
            [
              first.currency,
              first.cryptocurrency,
              first.symbol,
              first.tradeCurrency,
            ]
              .filter(Boolean)
              .join(" / "),
          calculatedRealizedGainLoss: round2(
            moneySum(calculated.map((value) => value.realizedGainLoss)),
          ),
          calculatedUnrealizedGainLoss: round2(
            moneySum(calculated.map((value) => value.unrealizedGainLoss)),
          ),
          recordedGainLoss: round2(
            moneySum(recorded.map((value) => value.realizedGainLoss)),
          ),
        },
        children: [],
      });
    }
    if (!children.length) continue;
    hierarchy.push({
      id: `asset-class:${descriptor.value}`,
      label: descriptor.label,
      ...totals(
        moneySum(contributions.map((value) => value.realizedGainLoss)),
        moneySum(contributions.map((value) => value.unrealizedGainLoss)),
      ),
      children: children.sort(
        (a, b) =>
          a.label.localeCompare(b.label, "en") ||
          a.id.localeCompare(b.id, "en"),
      ),
    });
  }
  return { hierarchy };
}
