import type { MoneyInput } from "../../shared/money";
import {
  toMoney,
  type Money,
  moneyAdd,
  moneySubtract,
  moneyMultiply,
  moneyDivide,
  moneyAbs,
  moneyIsZero,
  moneyRound2,
  moneySum,
} from "../../shared/money";
import { AccountType, Unit } from "../../.prisma-client/enums";
import { startOfUtcDay } from "../../shared/date";

import type {
  BreakdownHierarchyNode,
  BreakdownNodeKind,
} from "../../shared/breakdown-hierarchy";

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
  amount: Money;
};

export type BreakdownHierarchyAccumulatorItem = {
  accountId: string;
  accountName: string;
  groupId: string | null;
  amount: Money;
};

export type HoldingEvent = {
  date: Date;
  balanceDelta: Money;
};

export type HoldingGainLossSeriesEvent = {
  rate: Money;
  balanceDelta: Money;
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

export function round2(value: MoneyInput): Money {
  return moneyRound2(value);
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
  totalAmount: Money;
  items: Array<{
    id: string;
    label: string;
    kind: "group" | "account";
    amount: Money;
    percentage: Money;
  }>;
} {
  const positiveItems = items.filter(
    (item) => toMoney(item.amount).comparedTo(0) > 0,
  );
  const totalRaw = moneySum(positiveItems.map((item) => item.amount));

  const sortedItems = positiveItems
    .map((item) => ({
      ...item,
      amount: round2(item.amount),
      percentage:
        toMoney(totalRaw).comparedTo(0) <= 0
          ? toMoney(0)
          : round2(moneyMultiply(moneyDivide(item.amount, totalRaw), 100)),
    }))
    .sort((a, b) => toMoney(b.amount).comparedTo(a.amount));

  return {
    totalAmount: round2(moneySum(sortedItems.map((item) => item.amount))),
    items: sortedItems,
  };
}

export function buildPeriodEndAllocationBreakdown(args: {
  items: Array<{
    accountId: string;
    accountName: string;
    groupId: string | null;
    accountType: "ASSET" | "LIABILITY";
    convertedBalanceInReferenceCurrency: Money | null;
  }>;
  groupById: Map<string, PeriodGroupNode>;
}): {
  totalAmount: Money;
  items: Array<{
    id: string;
    label: string;
    kind: "group" | "account";
    amount: Money;
    percentage: Money;
  }>;
  hierarchy: BreakdownHierarchyNode<Money>[];
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
        : toMoney(item.convertedBalanceInReferenceCurrency).neg();

    if (toMoney(displayAmount).comparedTo(0) < 0) {
      skippedNegativeCount += 1;
      continue;
    }
    if (moneyIsZero(displayAmount)) {
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
  amount: Money;
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
    amount: toMoney(0),
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
  hierarchy: BreakdownHierarchyNode<Money>[];
  hasHiddenAmountDiscrepancy: boolean;
  hiddenAmountDiscrepancyNodeIdsInSubtree: Set<string>;
  rawDisplayedAmount: Money;
  prunedNodeCount: number;
} {
  const nodes: BreakdownHierarchyNode<Money>[] = [];
  const hiddenAmountDiscrepancyNodeIdsInSubtree = new Set<string>();
  let rawDisplayedAmount: Money = toMoney(0);
  let prunedNodeCount = 0;

  for (const node of childrenById.values()) {
    if (node.kind === "account") {
      const roundedAmount = round2(node.amount);

      if (toMoney(roundedAmount).comparedTo(0) <= 0) {
        prunedNodeCount += 1;
        continue;
      }

      rawDisplayedAmount = moneyAdd(rawDisplayedAmount, node.amount);
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

    if (toMoney(roundedAmount).comparedTo(0) <= 0) {
      prunedNodeCount += 1;
      continue;
    }

    if (children.length === 0) {
      prunedNodeCount += 1;
      continue;
    }

    if (
      prunedChildNodeCount > 0 &&
      !moneyIsZero(moneySubtract(roundedDisplayedChildrenAmount, roundedAmount))
    ) {
      hiddenAmountDiscrepancyNodeIdsInSubtree.add(node.id);
    } else if (hasChildDiscrepancy) {
      hiddenAmountDiscrepancyNodeIdsInSubtree.add(node.id);
    }

    for (const nodeId of childDiscrepancyNodeIds) {
      hiddenAmountDiscrepancyNodeIdsInSubtree.add(nodeId);
    }

    rawDisplayedAmount = moneyAdd(rawDisplayedAmount, node.amount);
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
      toMoney(b.amount).comparedTo(a.amount) ||
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
  hierarchy: BreakdownHierarchyNode<Money>[];
  hasHiddenAmountDiscrepancy: boolean;
  hiddenAmountDiscrepancyNodeIds: string[];
} {
  const rootChildrenById = new Map<string, MutableBreakdownHierarchyNode>();

  for (const item of args.items) {
    if (moneyIsZero(item.amount)) {
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
      groupNode.amount = moneyAdd(groupNode.amount, item.amount);
      currentChildrenById = groupNode.childrenById;
    }

    const accountNode = getOrCreateMutableBreakdownHierarchyNode({
      nodeId: `account:${item.accountId}`,
      label: item.accountName,
      kind: "account",
      childrenById: currentChildrenById,
    });
    accountNode.amount = moneyAdd(accountNode.amount, item.amount);
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

function finalizeSignedBreakdownHierarchyNodes(
  childrenById: Map<string, MutableBreakdownHierarchyNode>,
): {
  hierarchy: BreakdownHierarchyNode<Money>[];
  hasHiddenAmountDiscrepancy: boolean;
  hiddenAmountDiscrepancyNodeIdsInSubtree: Set<string>;
  rawDisplayedAmount: Money;
  prunedNodeCount: number;
} {
  const nodes: BreakdownHierarchyNode<Money>[] = [];
  const hiddenAmountDiscrepancyNodeIdsInSubtree = new Set<string>();
  let rawDisplayedAmount: Money = toMoney(0);
  let prunedNodeCount = 0;

  for (const node of childrenById.values()) {
    if (node.kind === "account") {
      const roundedAmount = round2(node.amount);

      if (moneyIsZero(roundedAmount)) {
        prunedNodeCount += 1;
        continue;
      }

      rawDisplayedAmount = moneyAdd(rawDisplayedAmount, node.amount);
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
    } = finalizeSignedBreakdownHierarchyNodes(node.childrenById);
    prunedNodeCount += prunedChildNodeCount;

    const roundedAmount = round2(node.amount);
    const roundedDisplayedChildrenAmount = round2(rawDisplayedChildrenAmount);

    if (children.length === 0) {
      prunedNodeCount += 1;
      continue;
    }

    if (
      prunedChildNodeCount > 0 &&
      !moneyIsZero(moneySubtract(roundedDisplayedChildrenAmount, roundedAmount))
    ) {
      hiddenAmountDiscrepancyNodeIdsInSubtree.add(node.id);
    } else if (hasChildDiscrepancy) {
      hiddenAmountDiscrepancyNodeIdsInSubtree.add(node.id);
    }

    for (const nodeId of childDiscrepancyNodeIds) {
      hiddenAmountDiscrepancyNodeIdsInSubtree.add(nodeId);
    }

    rawDisplayedAmount = moneyAdd(rawDisplayedAmount, node.amount);
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
      moneyAbs(b.amount).comparedTo(moneyAbs(a.amount)) ||
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

export function buildSignedBreakdownHierarchyWithMeta(args: {
  items: BreakdownHierarchyAccumulatorItem[];
  groupById: Map<string, PeriodGroupNode>;
}): {
  hierarchy: BreakdownHierarchyNode<Money>[];
  hasHiddenAmountDiscrepancy: boolean;
  hiddenAmountDiscrepancyNodeIds: string[];
} {
  const rootChildrenById = new Map<string, MutableBreakdownHierarchyNode>();

  for (const item of args.items) {
    if (moneyIsZero(item.amount)) {
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
      groupNode.amount = moneyAdd(groupNode.amount, item.amount);
      currentChildrenById = groupNode.childrenById;
    }

    const accountNode = getOrCreateMutableBreakdownHierarchyNode({
      nodeId: `account:${item.accountId}`,
      label: item.accountName,
      kind: "account",
      childrenById: currentChildrenById,
    });
    accountNode.amount = moneyAdd(accountNode.amount, item.amount);
  }

  const {
    hierarchy,
    hasHiddenAmountDiscrepancy,
    hiddenAmountDiscrepancyNodeIdsInSubtree,
  } = finalizeSignedBreakdownHierarchyNodes(rootChildrenById);

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
}): BreakdownHierarchyNode<Money>[] {
  return buildBreakdownHierarchyWithMeta(args).hierarchy;
}

export function computeHoldingGainLossForEventSeries(args: {
  initialBalance: Money;
  initialRate: Money;
  events: HoldingGainLossSeriesEvent[];
}): Money {
  let balance = args.initialBalance;
  let previousRate = args.initialRate;
  let gainLoss: Money = toMoney(0);

  for (const event of args.events) {
    const rateDiff = moneySubtract(event.rate, previousRate);
    gainLoss = moneyAdd(gainLoss, moneyMultiply(balance, rateDiff));
    balance = moneyAdd(balance, event.balanceDelta);
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
  bookings: Array<{ date: Date; value: Money }>;
  periodEnd: Date;
}): Map<string, HoldingEvent> {
  const eventByDateKey = new Map<string, HoldingEvent>();

  for (const booking of args.bookings) {
    const date = startOfUtcDay(booking.date);
    const dateKey = toDateKey(date);
    const existing = eventByDateKey.get(dateKey);

    if (existing) {
      existing.balanceDelta = moneyAdd(existing.balanceDelta, booking.value);
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
      balanceDelta: toMoney(0),
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
