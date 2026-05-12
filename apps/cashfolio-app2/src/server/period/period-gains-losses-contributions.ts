import { AccountType, Unit } from "../../.prisma-client/enums";
import { prisma } from "../../prisma.server";
import { isNearZero } from "./period-overview-holdings-common";

export type GainLossContributionAccumulator = {
  sourceKind: "HOLDING" | "EXPLICIT";
  accountId: string;
  accountName: string;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  realizedGainLoss: number;
  unrealizedGainLoss: number;
};

export type ExplicitCounterpartAccount = {
  id: string;
  name: string;
};

const EXPLICIT_UNATTRIBUTED_MISSING_COUNTERPART_ACCOUNT: ExplicitCounterpartAccount =
  {
    id: "explicit-unattributed:missing-counterpart",
    name: "Unattributed (No counterpart account)",
  };
const EXPLICIT_UNATTRIBUTED_MULTIPLE_COUNTERPARTS_ACCOUNT: ExplicitCounterpartAccount =
  {
    id: "explicit-unattributed:multiple-counterparts",
    name: "Unattributed (Multiple counterpart accounts)",
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
  realizedGainLoss: number;
  unrealizedGainLoss: number;
}) {
  const realizedGainLoss = isNearZero(args.realizedGainLoss)
    ? 0
    : args.realizedGainLoss;
  const unrealizedGainLoss = isNearZero(args.unrealizedGainLoss)
    ? 0
    : args.unrealizedGainLoss;

  if (realizedGainLoss === 0 && unrealizedGainLoss === 0) {
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
    existing.realizedGainLoss += realizedGainLoss;
    existing.unrealizedGainLoss += unrealizedGainLoss;
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

export async function resolveExplicitCounterpartNonEquityAccounts(args: {
  accountBookId: string;
  explicitTransactionIds: string[];
  byTransactionId: Map<string, ExplicitCounterpartAccount>;
}) {
  const missingTransactionIds = Array.from(
    new Set(
      args.explicitTransactionIds.filter(
        (transactionId) => !args.byTransactionId.has(transactionId),
      ),
    ),
  );
  if (missingTransactionIds.length === 0) {
    return;
  }

  const counterpartBookings = await prisma.booking.findMany({
    where: {
      accountBookId: args.accountBookId,
      transactionId: { in: missingTransactionIds },
      account: {
        type: {
          in: [AccountType.ASSET, AccountType.LIABILITY],
        },
      },
    },
    select: {
      transactionId: true,
      accountId: true,
      account: {
        select: {
          name: true,
        },
      },
    },
  });

  const counterpartByTransactionId = new Map<string, Map<string, string>>();
  for (const counterpartBooking of counterpartBookings) {
    const byAccountId =
      counterpartByTransactionId.get(counterpartBooking.transactionId) ??
      new Map<string, string>();
    byAccountId.set(
      counterpartBooking.accountId,
      counterpartBooking.account.name,
    );
    counterpartByTransactionId.set(
      counterpartBooking.transactionId,
      byAccountId,
    );
  }

  for (const transactionId of missingTransactionIds) {
    const counterpartByAccountId =
      counterpartByTransactionId.get(transactionId) ??
      new Map<string, string>();

    if (counterpartByAccountId.size === 0) {
      args.byTransactionId.set(
        transactionId,
        EXPLICIT_UNATTRIBUTED_MISSING_COUNTERPART_ACCOUNT,
      );
      continue;
    }
    if (counterpartByAccountId.size > 1) {
      args.byTransactionId.set(
        transactionId,
        EXPLICIT_UNATTRIBUTED_MULTIPLE_COUNTERPARTS_ACCOUNT,
      );
      continue;
    }

    const entry = counterpartByAccountId.entries().next().value;
    if (!entry) {
      args.byTransactionId.set(
        transactionId,
        EXPLICIT_UNATTRIBUTED_MISSING_COUNTERPART_ACCOUNT,
      );
      continue;
    }

    const [id, name] = entry;
    args.byTransactionId.set(transactionId, { id, name });
  }
}
