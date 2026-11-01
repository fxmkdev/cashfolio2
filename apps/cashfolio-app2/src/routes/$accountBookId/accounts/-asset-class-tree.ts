import {
  classificationOptions,
  type ClassificationNode,
} from "@/shared/asset-class";
import {
  aggregateAccountGainLoss,
  EMPTY_GAIN_LOSS_SUMMARY,
  type AccountGainLossSummaries,
  type AccountGainLossResult,
} from "@/shared/account-gain-loss";
import { toMoneyNumber } from "@/shared/money";
import { getGainLossInvestmentGroup } from "@/shared/investment-group";
import type { TreeRow } from "./-page-types";

export const assetClassRowId = (id: string) => `__asset_class__:${id}`;
export const UNCLASSIFIED_ROW_ID = "__asset_class_unclassified__";
export const unitRowId = (classId: string, key: string) =>
  `__asset_class_unit__:${encodeURIComponent(classId)}:${encodeURIComponent(key)}`;
export const archivedClassRowId = (id: string) =>
  `__asset_class_archived__:${id}`;

function heading(
  id: string,
  name: string,
  parentId: string | undefined,
  kind: NonNullable<TreeRow["presentationKind"]>,
): TreeRow {
  return {
    id,
    name,
    parentId,
    presentationKind: kind,
    nodeType: "accountGroup",
    type: "BALANCE",
    equityAccountSubtype: null,
    isVirtualArchivedGroup: kind === "archived",
    isActive: kind !== "archived",
    groupId: undefined,
    sortOrder: null,
    unit: null,
    currency: null,
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    balance: null,
    balanceInReferenceCurrency: null,
    openingBalance: null,
    deletable: false,
    deleteDisabledReason: undefined,
    archivable: false,
    archiveDisabledReason: undefined,
    unarchivable: false,
    unarchiveDisabledReason: undefined,
  };
}

function getOriginalAccountGroupPath(
  account: TreeRow,
  groups: Map<string, TreeRow>,
): string[] {
  const path: string[] = [];
  const seen = new Set<string>();
  let group = account.groupId ? groups.get(account.groupId) : undefined;
  while (group && !seen.has(group.id)) {
    seen.add(group.id);
    path.unshift(group.name);
    const parent =
      group.persistedParentId === undefined
        ? group.parentId
        : group.persistedParentId;
    group = parent ? groups.get(parent) : undefined;
  }
  return path;
}

type UnitGroup = {
  id: string;
  parentId: string;
  key: string;
  label: string;
  accounts: TreeRow[];
};

function appendUnitGroups(result: TreeRow[], units: Map<string, UnitGroup>) {
  const orderedUnits = [...units.values()].sort(
    (a, b) =>
      a.label.localeCompare(b.label, "en") ||
      a.key.localeCompare(b.key, "en") ||
      a.id.localeCompare(b.id),
  );
  for (const unit of orderedUnits) {
    result.push(heading(unit.id, unit.label, unit.parentId, "unit"));
    unit.accounts.sort(
      (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );
    result.push(...unit.accounts.filter((account) => account.isActive));
    const archived = unit.accounts.filter((account) => !account.isActive);
    if (archived.length)
      result.push(
        heading(archivedClassRowId(unit.id), "Archived", unit.id, "archived"),
        ...archived,
      );
  }
}

/** Project only account leaves; original groups are used solely for name context. */
export function buildAssetClassTree(
  rows: TreeRow[],
  classes: readonly ClassificationNode[],
): TreeRow[] {
  const groups = new Map(
    rows
      .filter(
        (row) => row.nodeType === "accountGroup" && !row.isVirtualArchivedGroup,
      )
      .map((row) => [row.id, row]),
  );
  const orderedClasses = classificationOptions(classes);
  const classById = new Map(classes.map((node) => [node.id, node]));
  const validIds = new Set(orderedClasses.map((node) => node.value));
  const units = new Map<string, UnitGroup>();
  const occupied = new Set<string>();
  for (const account of rows) {
    if (account.nodeType !== "account") continue;
    const classId =
      account.assetClassId && validIds.has(account.assetClassId)
        ? account.assetClassId
        : null;
    let node = classId ? classById.get(classId) : undefined;
    while (node && !occupied.has(node.id)) {
      occupied.add(node.id);
      node = node.parentId ? classById.get(node.parentId) : undefined;
    }
    const parentId = classId ? assetClassRowId(classId) : UNCLASSIFIED_ROW_ID;
    const investment = getGainLossInvestmentGroup(account);
    const id = unitRowId(parentId, investment.key);
    const unit: UnitGroup = units.get(id) ?? {
      id,
      parentId,
      ...investment,
      accounts: [],
    };
    unit.accounts.push({
      ...account,
      parentId: account.isActive ? id : archivedClassRowId(id),
      accountGroupPath: getOriginalAccountGroupPath(account, groups),
    });
    units.set(id, unit);
  }
  const result: TreeRow[] = orderedClasses
    .filter((node) => occupied.has(node.value))
    .map(({ value }) => {
      const node = classById.get(value)!;
      return heading(
        assetClassRowId(node.id),
        node.name,
        node.parentId ? assetClassRowId(node.parentId) : undefined,
        "assetClass",
      );
    });
  if ([...units.values()].some((unit) => unit.parentId === UNCLASSIFIED_ROW_ID))
    result.push(
      heading(UNCLASSIFIED_ROW_ID, "Unclassified", undefined, "unclassified"),
    );
  appendUnitGroups(result, units);
  return result;
}

/** Reuse leaf calculations, never the server's account-structure group totals. */
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
  const results = new Map<string, AccountGainLossResult>();
  const summarize = (row: TreeRow): AccountGainLossResult => {
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
    const aggregated = aggregateAccountGainLoss(
      (children.get(row.id) ?? []).map(summarize),
    );
    const result = {
      ...aggregated,
      summary: {
        realizedGainLoss:
          aggregated.summary.realizedGainLoss == null
            ? null
            : toMoneyNumber(aggregated.summary.realizedGainLoss),
        unrealizedGainLoss:
          aggregated.summary.unrealizedGainLoss == null
            ? null
            : toMoneyNumber(aggregated.summary.unrealizedGainLoss),
        totalGainLoss:
          aggregated.summary.totalGainLoss == null
            ? null
            : toMoneyNumber(aggregated.summary.totalGainLoss),
      },
    };
    results.set(row.id, result);
    return result;
  };
  return {
    ...data,
    rows: rows.map((row) => ({ id: row.id, ...summarize(row) })),
  };
}
