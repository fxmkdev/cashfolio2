import { AccountType, Unit } from "../.prisma-client/enums";
import { startOfUtcDay } from "../shared/date";
import type {
  BreakdownHierarchyNode,
  BreakdownNodeKind,
} from "../shared/breakdown-hierarchy";

export type PeriodGroupNode = {
  id: string;
  name: string;
  parentGroupId: string | null;
};

type BreakdownBucket = {
  id: string;
  label: string;
  kind: BreakdownNodeKind;
};

export type ExpenseBreakdownAccumulatorItem = {
  id: string;
  label: string;
  kind: BreakdownNodeKind;
  amount: number;
};

export type BreakdownHierarchyAccumulatorItem = {
  accountId: string;
  accountName: string;
  groupId: string | null;
  amount: number;
};

export type HoldingEvent = {
  date: Date;
  balanceDelta: number;
};

export type HoldingGainLossSeriesEvent = {
  rate: number;
  balanceDelta: number;
};

export type GainsLossesUnitBreakdownAccumulator = {
  fxByCurrency: Map<string, number>;
  cryptocurrencyByCode: Map<string, number>;
  securityBySymbol: Map<string, number>;
};

type MultiUnitBooking = {
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
};

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function normalizeUnitCode(value: string | null): string | null {
  if (value == null) {
    return null;
  }

  const normalizedValue = value.trim().toUpperCase();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function addAmountByUnitCode(args: {
  amountByCode: Map<string, number>;
  code: string;
  amount: number;
}) {
  const previousAmount = args.amountByCode.get(args.code) ?? 0;
  args.amountByCode.set(args.code, previousAmount + args.amount);
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function createGainsLossesUnitBreakdownAccumulator(): GainsLossesUnitBreakdownAccumulator {
  return {
    fxByCurrency: new Map(),
    cryptocurrencyByCode: new Map(),
    securityBySymbol: new Map(),
  };
}

export function addGainsLossesUnitContribution(args: {
  accumulator: GainsLossesUnitBreakdownAccumulator;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  amount: number;
}) {
  if (args.amount === 0) {
    return;
  }

  if (args.unit === Unit.CURRENCY) {
    const normalizedCurrency = normalizeUnitCode(args.currency);
    if (!normalizedCurrency) {
      return;
    }

    addAmountByUnitCode({
      amountByCode: args.accumulator.fxByCurrency,
      code: normalizedCurrency,
      amount: args.amount,
    });
    return;
  }

  if (args.unit === Unit.CRYPTOCURRENCY) {
    const normalizedCryptocurrency = normalizeUnitCode(args.cryptocurrency);
    if (!normalizedCryptocurrency) {
      return;
    }

    addAmountByUnitCode({
      amountByCode: args.accumulator.cryptocurrencyByCode,
      code: normalizedCryptocurrency,
      amount: args.amount,
    });
    return;
  }

  const normalizedSymbol = normalizeUnitCode(args.symbol);
  if (!normalizedSymbol) {
    return;
  }

  addAmountByUnitCode({
    amountByCode: args.accumulator.securityBySymbol,
    code: normalizedSymbol,
    amount: args.amount,
  });
}

function sortContributorEntries(
  left: [string, number],
  right: [string, number],
): number {
  const leftAbsoluteAmount = Math.abs(left[1]);
  const rightAbsoluteAmount = Math.abs(right[1]);

  return (
    rightAbsoluteAmount - leftAbsoluteAmount ||
    left[0].localeCompare(right[0], "en")
  );
}

function buildGainsLossesChildNodes(args: {
  idPrefix: string;
  amountByCode: Map<string, number>;
}): BreakdownHierarchyNode[] {
  return Array.from(args.amountByCode.entries())
    .filter(([, amount]) => amount !== 0)
    .sort(sortContributorEntries)
    .map(([code, amount]) => ({
      id: `account:${args.idPrefix}:${code}`,
      label: code,
      kind: "account",
      amount,
      children: [],
    }));
}

export function buildGainsLossesUnitBreakdownHierarchy(args: {
  accumulator: GainsLossesUnitBreakdownAccumulator;
}): {
  totalAmount: number;
  hierarchy: BreakdownHierarchyNode[];
} {
  const fxChildren = buildGainsLossesChildNodes({
    idPrefix: "fx",
    amountByCode: args.accumulator.fxByCurrency,
  });
  const cryptocurrencyChildren = buildGainsLossesChildNodes({
    idPrefix: "crypto",
    amountByCode: args.accumulator.cryptocurrencyByCode,
  });
  const securityChildren = buildGainsLossesChildNodes({
    idPrefix: "security",
    amountByCode: args.accumulator.securityBySymbol,
  });

  const fxAmount = fxChildren.reduce((sum, item) => sum + item.amount, 0);
  const cryptocurrencyAmount = cryptocurrencyChildren.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const securityAmount = securityChildren.reduce(
    (sum, item) => sum + item.amount,
    0,
  );

  const hierarchy: BreakdownHierarchyNode[] = [
    {
      id: "group:gains-losses:fx",
      label: "FX",
      kind: "group",
      amount: fxAmount,
      children: fxChildren,
    },
    {
      id: "group:gains-losses:cryptocurrency",
      label: "Cryptocurrency",
      kind: "group",
      amount: cryptocurrencyAmount,
      children: cryptocurrencyChildren,
    },
    {
      id: "group:gains-losses:security",
      label: "Security",
      kind: "group",
      amount: securityAmount,
      children: securityChildren,
    },
  ];

  return {
    totalAmount: hierarchy.reduce((sum, item) => sum + item.amount, 0),
    hierarchy,
  };
}

function getBookingUnitIdentifier(booking: MultiUnitBooking): string | null {
  if (booking.unit === Unit.CURRENCY) {
    return booking.currency
      ? `currency:${booking.currency.toUpperCase()}`
      : null;
  }
  if (booking.unit === Unit.CRYPTOCURRENCY) {
    return booking.cryptocurrency
      ? `crypto:${booking.cryptocurrency.toUpperCase()}`
      : null;
  }
  if (!booking.symbol || !booking.tradeCurrency) {
    return null;
  }
  return `security:${booking.symbol.toUpperCase()}:${booking.tradeCurrency.toUpperCase()}`;
}

export function isMultiUnitTransaction(bookings: MultiUnitBooking[]): boolean {
  const unitIdentifiers = new Set<string>();

  for (const booking of bookings) {
    const unitIdentifier = getBookingUnitIdentifier(booking);
    if (!unitIdentifier) {
      return false;
    }
    unitIdentifiers.add(unitIdentifier);
  }

  return unitIdentifiers.size > 1;
}

export function shouldIncludeTransactionForPeriod(args: {
  bookingDates: Date[];
  periodStart: Date;
  periodEndExclusive: Date;
}): boolean {
  const { bookingDates, periodStart, periodEndExclusive } = args;

  if (bookingDates.length === 0) {
    return false;
  }

  const hasBookingInPeriod = bookingDates.some(
    (date) => date >= periodStart && date < periodEndExclusive,
  );
  if (!hasBookingInPeriod) {
    return false;
  }

  return bookingDates.every((date) => date < periodEndExclusive);
}

function resolveGroupPathToRoot(args: {
  groupId: string;
  groupById: Map<string, PeriodGroupNode>;
}): PeriodGroupNode[] {
  const { groupId, groupById } = args;
  const path: PeriodGroupNode[] = [];
  const visited = new Set<string>();

  let currentGroupId: string | null = groupId;
  while (currentGroupId) {
    if (visited.has(currentGroupId)) {
      break;
    }

    visited.add(currentGroupId);
    const group = groupById.get(currentGroupId);
    if (!group) {
      break;
    }

    path.push(group);
    currentGroupId = group.parentGroupId;
  }

  return path;
}

function getTopLevelGroup(args: {
  groupId: string;
  groupById: Map<string, PeriodGroupNode>;
}): PeriodGroupNode | null {
  const path = resolveGroupPathToRoot(args);
  if (path.length === 0) return null;
  return path[path.length - 1] ?? null;
}

export function createBreakdownBucket(args: {
  accountId: string;
  accountName: string;
  groupId: string | null;
  groupById: Map<string, PeriodGroupNode>;
}): BreakdownBucket {
  if (args.groupId) {
    const topLevelGroup = getTopLevelGroup({
      groupId: args.groupId,
      groupById: args.groupById,
    });

    if (topLevelGroup) {
      return {
        id: `group:${topLevelGroup.id}`,
        label: topLevelGroup.name,
        kind: "group",
      };
    }
  }

  return {
    id: `account:${args.accountId}`,
    label: args.accountName,
    kind: "account",
  };
}

export function buildBreakdownItems(items: ExpenseBreakdownAccumulatorItem[]): {
  totalAmount: number;
  items: Array<{
    id: string;
    label: string;
    kind: "group" | "account";
    amount: number;
    percentage: number;
  }>;
} {
  const positiveItems = items.filter((item) => item.amount > 0);
  const totalRaw = positiveItems.reduce((sum, item) => sum + item.amount, 0);

  const sortedItems = positiveItems
    .map((item) => ({
      ...item,
      amount: round2(item.amount),
      percentage: totalRaw <= 0 ? 0 : round2((item.amount / totalRaw) * 100),
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    totalAmount: round2(
      sortedItems.reduce((sum, item) => sum + item.amount, 0),
    ),
    items: sortedItems,
  };
}

export function buildPeriodEndAllocationBreakdown(args: {
  items: Array<{
    accountId: string;
    accountName: string;
    groupId: string | null;
    accountType: "ASSET" | "LIABILITY";
    convertedBalanceInReferenceCurrency: number | null;
  }>;
  groupById: Map<string, PeriodGroupNode>;
}): {
  totalAmount: number;
  items: Array<{
    id: string;
    label: string;
    kind: "group" | "account";
    amount: number;
    percentage: number;
  }>;
  hierarchy: BreakdownHierarchyNode[];
  hasHiddenAmountDiscrepancy: boolean;
  hiddenAmountDiscrepancyNodeIds: string[];
  skippedMissingReferenceBalanceCount: number;
  skippedNegativeCount: number;
} {
  const breakdownItems: BreakdownHierarchyAccumulatorItem[] = [];
  let skippedMissingReferenceBalanceCount = 0;
  let skippedNegativeCount = 0;

  for (const item of args.items) {
    if (item.convertedBalanceInReferenceCurrency == null) {
      skippedMissingReferenceBalanceCount += 1;
      continue;
    }

    const displayAmount =
      item.accountType === AccountType.ASSET
        ? item.convertedBalanceInReferenceCurrency
        : -item.convertedBalanceInReferenceCurrency;

    if (displayAmount < 0) {
      skippedNegativeCount += 1;
      continue;
    }
    if (displayAmount === 0) {
      continue;
    }

    breakdownItems.push({
      accountId: item.accountId,
      accountName: item.accountName,
      groupId: item.groupId,
      amount: displayAmount,
    });
  }

  const {
    hierarchy,
    hasHiddenAmountDiscrepancy,
    hiddenAmountDiscrepancyNodeIds,
  } = buildBreakdownHierarchyWithMeta({
    items: breakdownItems,
    groupById: args.groupById,
  });
  const topLevelBreakdown = buildBreakdownItems(
    hierarchy.map((node) => ({
      id: node.id,
      label: node.label,
      kind: node.kind,
      amount: node.amount,
    })),
  );

  return {
    totalAmount: topLevelBreakdown.totalAmount,
    items: topLevelBreakdown.items,
    hierarchy,
    hasHiddenAmountDiscrepancy,
    hiddenAmountDiscrepancyNodeIds,
    skippedMissingReferenceBalanceCount,
    skippedNegativeCount,
  };
}

type MutableBreakdownHierarchyNode = {
  id: string;
  label: string;
  kind: BreakdownNodeKind;
  amount: number;
  childrenById: Map<string, MutableBreakdownHierarchyNode>;
};

function createMutableBreakdownHierarchyNode(args: {
  id: string;
  label: string;
  kind: BreakdownNodeKind;
}): MutableBreakdownHierarchyNode {
  return {
    id: args.id,
    label: args.label,
    kind: args.kind,
    amount: 0,
    childrenById: new Map(),
  };
}

function getOrCreateMutableBreakdownHierarchyNode(args: {
  nodeId: string;
  label: string;
  kind: BreakdownNodeKind;
  childrenById: Map<string, MutableBreakdownHierarchyNode>;
}): MutableBreakdownHierarchyNode {
  const existing = args.childrenById.get(args.nodeId);
  if (existing) {
    return existing;
  }

  const created = createMutableBreakdownHierarchyNode({
    id: args.nodeId,
    label: args.label,
    kind: args.kind,
  });
  args.childrenById.set(args.nodeId, created);
  return created;
}

function finalizeBreakdownHierarchyNodes(
  childrenById: Map<string, MutableBreakdownHierarchyNode>,
): {
  hierarchy: BreakdownHierarchyNode[];
  hasHiddenAmountDiscrepancy: boolean;
  hiddenAmountDiscrepancyNodeIdsInSubtree: Set<string>;
  rawDisplayedAmount: number;
  prunedNodeCount: number;
} {
  const nodes: BreakdownHierarchyNode[] = [];
  const hiddenAmountDiscrepancyNodeIdsInSubtree = new Set<string>();
  let rawDisplayedAmount = 0;
  let prunedNodeCount = 0;

  for (const node of childrenById.values()) {
    if (node.kind === "account") {
      const roundedAmount = round2(node.amount);

      if (roundedAmount <= 0) {
        prunedNodeCount += 1;
        continue;
      }

      rawDisplayedAmount += node.amount;
      nodes.push({
        id: node.id,
        label: node.label,
        kind: node.kind,
        amount: roundedAmount,
        children: [],
      });
      continue;
    }

    const {
      hierarchy: children,
      hasHiddenAmountDiscrepancy: hasChildDiscrepancy,
      hiddenAmountDiscrepancyNodeIdsInSubtree: childDiscrepancyNodeIds,
      rawDisplayedAmount: rawDisplayedChildrenAmount,
      prunedNodeCount: prunedChildNodeCount,
    } = finalizeBreakdownHierarchyNodes(node.childrenById);
    prunedNodeCount += prunedChildNodeCount;

    const roundedAmount = round2(node.amount);
    const roundedDisplayedChildrenAmount = round2(rawDisplayedChildrenAmount);

    if (roundedAmount <= 0) {
      prunedNodeCount += 1;
      continue;
    }

    if (children.length === 0) {
      prunedNodeCount += 1;
      continue;
    }

    if (
      prunedChildNodeCount > 0 &&
      roundedDisplayedChildrenAmount !== roundedAmount
    ) {
      hiddenAmountDiscrepancyNodeIdsInSubtree.add(node.id);
    } else if (hasChildDiscrepancy) {
      hiddenAmountDiscrepancyNodeIdsInSubtree.add(node.id);
    }

    for (const nodeId of childDiscrepancyNodeIds) {
      hiddenAmountDiscrepancyNodeIdsInSubtree.add(nodeId);
    }

    rawDisplayedAmount += node.amount;
    nodes.push({
      id: node.id,
      label: node.label,
      kind: node.kind,
      amount: roundedAmount,
      children,
    });
  }

  nodes.sort(
    (a, b) =>
      b.amount - a.amount ||
      a.label.localeCompare(b.label, "en") ||
      a.id.localeCompare(b.id),
  );

  return {
    hierarchy: nodes,
    hasHiddenAmountDiscrepancy:
      hiddenAmountDiscrepancyNodeIdsInSubtree.size > 0,
    hiddenAmountDiscrepancyNodeIdsInSubtree,
    rawDisplayedAmount,
    prunedNodeCount,
  };
}

export function buildBreakdownHierarchyWithMeta(args: {
  items: BreakdownHierarchyAccumulatorItem[];
  groupById: Map<string, PeriodGroupNode>;
}): {
  hierarchy: BreakdownHierarchyNode[];
  hasHiddenAmountDiscrepancy: boolean;
  hiddenAmountDiscrepancyNodeIds: string[];
} {
  const rootChildrenById = new Map<string, MutableBreakdownHierarchyNode>();

  for (const item of args.items) {
    if (item.amount === 0) {
      continue;
    }

    const groupPath = item.groupId
      ? resolveGroupPathToRoot({
          groupId: item.groupId,
          groupById: args.groupById,
        }).reverse()
      : [];

    let currentChildrenById = rootChildrenById;

    for (const group of groupPath) {
      const groupNode = getOrCreateMutableBreakdownHierarchyNode({
        nodeId: `group:${group.id}`,
        label: group.name,
        kind: "group",
        childrenById: currentChildrenById,
      });
      groupNode.amount += item.amount;
      currentChildrenById = groupNode.childrenById;
    }

    const accountNode = getOrCreateMutableBreakdownHierarchyNode({
      nodeId: `account:${item.accountId}`,
      label: item.accountName,
      kind: "account",
      childrenById: currentChildrenById,
    });
    accountNode.amount += item.amount;
  }

  const {
    hierarchy,
    hasHiddenAmountDiscrepancy,
    hiddenAmountDiscrepancyNodeIdsInSubtree,
  } = finalizeBreakdownHierarchyNodes(rootChildrenById);

  return {
    hierarchy,
    hasHiddenAmountDiscrepancy,
    hiddenAmountDiscrepancyNodeIds: Array.from(
      hiddenAmountDiscrepancyNodeIdsInSubtree,
    ).sort((a, b) => a.localeCompare(b, "en")),
  };
}

export function buildBreakdownHierarchy(args: {
  items: BreakdownHierarchyAccumulatorItem[];
  groupById: Map<string, PeriodGroupNode>;
}): BreakdownHierarchyNode[] {
  return buildBreakdownHierarchyWithMeta(args).hierarchy;
}

export function computeHoldingGainLossForEventSeries(args: {
  initialBalance: number;
  initialRate: number;
  events: HoldingGainLossSeriesEvent[];
}): number {
  let balance = args.initialBalance;
  let previousRate = args.initialRate;
  let gainLoss = 0;

  for (const event of args.events) {
    const rateDiff = event.rate - previousRate;
    gainLoss += balance * rateDiff;
    balance += event.balanceDelta;
    previousRate = event.rate;
  }

  return gainLoss;
}

export function buildAvailableYears(args: {
  firstBookingDate: Date | null;
  now: Date;
}): number[] {
  const currentYear = args.now.getUTCFullYear();
  const minYear = args.firstBookingDate
    ? startOfUtcDay(args.firstBookingDate).getUTCFullYear()
    : currentYear;

  const years: number[] = [];
  for (let year = currentYear; year >= minYear; year -= 1) {
    years.push(year);
  }

  return years;
}

export function sortHoldingEventsAscending(
  events: HoldingEvent[],
): HoldingEvent[] {
  return [...events].sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function getHoldingEventDateMap(args: {
  bookings: Array<{ date: Date; value: number }>;
  periodEnd: Date;
}): Map<string, HoldingEvent> {
  const eventByDateKey = new Map<string, HoldingEvent>();

  for (const booking of args.bookings) {
    const date = startOfUtcDay(booking.date);
    const dateKey = toDateKey(date);
    const existing = eventByDateKey.get(dateKey);

    if (existing) {
      existing.balanceDelta += booking.value;
    } else {
      eventByDateKey.set(dateKey, {
        date,
        balanceDelta: booking.value,
      });
    }
  }

  const periodEndDate = startOfUtcDay(args.periodEnd);
  const periodEndKey = toDateKey(periodEndDate);
  if (!eventByDateKey.has(periodEndKey)) {
    eventByDateKey.set(periodEndKey, {
      date: periodEndDate,
      balanceDelta: 0,
    });
  }

  return eventByDateKey;
}

export function filterConvertibleHoldingAccounts(
  accounts: Array<{
    id: string;
    unit: Unit | null;
    currency: string | null;
    cryptocurrency: string | null;
    symbol: string | null;
    tradeCurrency: string | null;
  }>,
  referenceCurrency: string,
) {
  return accounts
    .filter(
      (
        account,
      ): account is {
        id: string;
        unit: Unit;
        currency: string | null;
        cryptocurrency: string | null;
        symbol: string | null;
        tradeCurrency: string | null;
      } => account.unit != null,
    )
    .filter((account) => {
      if (account.unit === Unit.CURRENCY) {
        return (
          account.currency != null &&
          account.currency.toUpperCase() !== referenceCurrency
        );
      }
      if (account.unit === Unit.CRYPTOCURRENCY) {
        return account.cryptocurrency != null;
      }
      return account.symbol != null && account.tradeCurrency != null;
    });
}
