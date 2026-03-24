export type AssetAllocationItemKind = "group" | "ungroupedAccount";

export type DashboardAssetAllocationItem = {
  id: string;
  label: string;
  amount: number;
  percentage: number;
  kind: AssetAllocationItemKind;
};

export type DashboardAssetAllocation = {
  referenceCurrency: string;
  totalIncludedAmount: number;
  items: DashboardAssetAllocationItem[];
  skippedMissingReferenceBalanceCount: number;
  skippedNonPositiveCount: number;
};

export type AssetAllocationTreeRow = {
  id: string;
  name: string;
  nodeType: "account" | "accountGroup";
  parentId?: string;
  groupId?: string;
  balanceInReferenceCurrency: number | null;
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getTopLevelGroupId(
  groupId: string,
  groupById: Map<string, AssetAllocationTreeRow>,
): string {
  let currentGroupId = groupId;
  const visited = new Set<string>([currentGroupId]);
  let parentGroupId = groupById.get(currentGroupId)?.parentId;

  while (parentGroupId && groupById.has(parentGroupId)) {
    if (visited.has(parentGroupId)) {
      break;
    }
    visited.add(parentGroupId);
    currentGroupId = parentGroupId;
    parentGroupId = groupById.get(currentGroupId)?.parentId;
  }

  return currentGroupId;
}

export function buildAssetAllocationFromTreeRows(args: {
  rows: AssetAllocationTreeRow[];
  referenceCurrency: string;
}): DashboardAssetAllocation {
  const { rows, referenceCurrency } = args;
  const groupById = new Map(
    rows
      .filter(
        (row): row is AssetAllocationTreeRow & { nodeType: "accountGroup" } =>
          row.nodeType === "accountGroup",
      )
      .map((row) => [row.id, row]),
  );
  const itemById = new Map<string, DashboardAssetAllocationItem>();
  let skippedMissingReferenceBalanceCount = 0;
  let skippedNonPositiveCount = 0;

  const accumulate = (item: {
    id: string;
    label: string;
    kind: AssetAllocationItemKind;
    amount: number;
  }) => {
    const existing = itemById.get(item.id);
    if (existing) {
      existing.amount += item.amount;
      return;
    }

    itemById.set(item.id, {
      id: item.id,
      label: item.label,
      amount: item.amount,
      percentage: 0,
      kind: item.kind,
    });
  };

  for (const row of rows) {
    if (row.nodeType !== "account") continue;

    if (row.balanceInReferenceCurrency == null) {
      skippedMissingReferenceBalanceCount += 1;
      continue;
    }

    const amount = Number(row.balanceInReferenceCurrency);
    if (amount <= 0) {
      skippedNonPositiveCount += 1;
      continue;
    }

    if (row.groupId) {
      const topLevelGroupId = getTopLevelGroupId(row.groupId, groupById);
      const topLevelGroup = groupById.get(topLevelGroupId);

      if (topLevelGroup) {
        accumulate({
          id: `group:${topLevelGroup.id}`,
          label: topLevelGroup.name,
          kind: "group",
          amount,
        });
        continue;
      }
    }

    accumulate({
      id: `account:${row.id}`,
      label: row.name,
      kind: "ungroupedAccount",
      amount,
    });
  }

  const items = Array.from(itemById.values())
    .sort((a, b) => b.amount - a.amount)
    .map((item) => ({
      ...item,
      amount: round2(item.amount),
    }));
  const totalIncludedAmount = round2(
    items.reduce((sum, item) => sum + item.amount, 0),
  );

  const itemsWithPercentages = items.map((item) => ({
    ...item,
    percentage:
      totalIncludedAmount <= 0
        ? 0
        : round2((item.amount / totalIncludedAmount) * 100),
  }));

  return {
    referenceCurrency,
    totalIncludedAmount,
    items: itemsWithPercentages,
    skippedMissingReferenceBalanceCount,
    skippedNonPositiveCount,
  };
}
