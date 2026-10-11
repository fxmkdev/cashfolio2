import { toMoney, type Money, moneyAdd } from "../../../shared/money";
import { Unit } from "../../../.prisma-client/enums";
import { isNearZero } from "../holdings/period-overview-holdings-common";

export type GainLossContributionAccumulator = {
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

export type ExplicitCounterpartAccount = {
  id: string;
  name: string;
};

function normalizeGainLossCode(value: string | null): string {
  if (typeof value !== "string") {
    return "UNKNOWN";
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "UNKNOWN";
  }

  return trimmed.toUpperCase();
}

function toGainLossUnitContributionKey(args: {
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
}): string {
  if (args.unit === Unit.CURRENCY) {
    return `fx:${normalizeGainLossCode(args.currency)}`;
  }
  if (args.unit === Unit.CRYPTOCURRENCY) {
    return `crypto:${normalizeGainLossCode(args.cryptocurrency)}`;
  }
  return `security:${normalizeGainLossCode(args.symbol)}:${normalizeGainLossCode(args.tradeCurrency)}`;
}

function toGainLossContributionKey(args: {
  sourceKind: GainLossContributionAccumulator["sourceKind"];
  accountId: string;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
}): string {
  if (args.sourceKind === "EXPLICIT") {
    return `explicit:${args.accountId}`;
  }

  return `holding:${args.accountId}:${toGainLossUnitContributionKey({
    unit: args.unit,
    currency: args.currency,
    cryptocurrency: args.cryptocurrency,
    symbol: args.symbol,
    tradeCurrency: args.tradeCurrency,
  })}`;
}

export function accumulateGainLossContribution(args: {
  byKey: Map<string, GainLossContributionAccumulator>;
  sourceKind: GainLossContributionAccumulator["sourceKind"];
  accountId: string;
  accountName: string;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  realizedGainLoss: Money;
  unrealizedGainLoss: Money;
}) {
  const realizedGainLoss = isNearZero(args.realizedGainLoss)
    ? toMoney(0)
    : args.realizedGainLoss;
  const unrealizedGainLoss = isNearZero(args.unrealizedGainLoss)
    ? toMoney(0)
    : args.unrealizedGainLoss;

  if (
    toMoney(realizedGainLoss).equals(0) &&
    toMoney(unrealizedGainLoss).equals(0)
  ) {
    return;
  }

  const key = toGainLossContributionKey({
    sourceKind: args.sourceKind,
    accountId: args.accountId,
    unit: args.unit,
    currency: args.currency,
    cryptocurrency: args.cryptocurrency,
    symbol: args.symbol,
    tradeCurrency: args.tradeCurrency,
  });
  const existing = args.byKey.get(key);

  if (existing) {
    existing.realizedGainLoss = moneyAdd(
      existing.realizedGainLoss,
      realizedGainLoss,
    );
    existing.unrealizedGainLoss = moneyAdd(
      existing.unrealizedGainLoss,
      unrealizedGainLoss,
    );
    if (
      isNearZero(existing.realizedGainLoss) &&
      isNearZero(existing.unrealizedGainLoss)
    ) {
      args.byKey.delete(key);
      return;
    }
    return;
  }

  args.byKey.set(key, {
    sourceKind: args.sourceKind,
    accountId: args.accountId,
    accountName: args.accountName,
    unit: args.unit,
    currency: args.currency,
    cryptocurrency: args.cryptocurrency,
    symbol: args.symbol,
    tradeCurrency: args.tradeCurrency,
    realizedGainLoss,
    unrealizedGainLoss,
  });
}
