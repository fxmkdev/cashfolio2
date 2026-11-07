import { getUnitFilterValue } from "@/components/grid/unit-filter-value";
import type { ClassificationNode } from "@/shared/asset-class";
import { getAccountTrackingMethodLabel } from "@/shared/account-tracking-method";
import {
  addSetFilterOption,
  buildHierarchySetFilterOptions,
  SET_FILTER_SPECIAL,
  setFilterEntityKey,
  type SetFilterOptions,
} from "@/components/grid/set-filter";
import type { TreeRow } from "./page-types";

export type AccountFilterDimension =
  "unitIdentifier" | "assetClass" | "path" | "trackingMethod";
export type AccountFilterContext = Record<
  AccountFilterDimension,
  { options: SetFilterOptions; valuesByAccountId: Map<string, string[]> }
>;

function emptyDimension(): AccountFilterContext[AccountFilterDimension] {
  return {
    options: { values: [], paths: new Map(), labels: new Map() },
    valuesByAccountId: new Map(),
  };
}

export function buildAccountFilterContext(
  sourceRows: readonly TreeRow[],
  displayedRows: readonly TreeRow[],
  classes: readonly ClassificationNode[],
): AccountFilterContext {
  const context: AccountFilterContext = {
    unitIdentifier: emptyDimension(),
    assetClass: emptyDimension(),
    path: emptyDimension(),
    trackingMethod: emptyDimension(),
  };
  const classesById = new Map(classes.map((node) => [node.id, node]));
  const groups = sourceRows.filter(
    (row) => row.nodeType === "accountGroup" && !row.isVirtualArchivedGroup,
  );
  const groupIds = new Set(groups.map((row) => row.id));
  const displayedById = new Map(displayedRows.map((row) => [row.id, row]));
  const usedClasses = new Set<string>();
  const usedGroups = new Set<string>();

  for (const row of displayedRows) {
    if (row.nodeType !== "account") continue;
    const unit = getUnitFilterValue(row);
    context.unitIdentifier.valuesByAccountId.set(row.id, unit ? [unit] : []);
    const classId =
      row.assetClassId && classesById.has(row.assetClassId)
        ? row.assetClassId
        : null;
    if (classId) usedClasses.add(classId);
    const groupId =
      row.groupId && groupIds.has(row.groupId) ? row.groupId : null;
    if (groupId) usedGroups.add(groupId);
    const classValues = [
      classId ? setFilterEntityKey(classId) : SET_FILTER_SPECIAL.unclassified,
    ];
    const trackingValues = [
      row.trackingMethod ?? "INDIVIDUAL_UNITS",
    ] as string[];
    const seen = new Set<string>([row.id]);
    let parent = row.parentId ? displayedById.get(row.parentId) : undefined;
    while (parent && !seen.has(parent.id)) {
      seen.add(parent.id);
      if (parent.groupAssetClass === "Mixed") {
        if (!classValues.includes(SET_FILTER_SPECIAL.mixed))
          classValues.push(SET_FILTER_SPECIAL.mixed);
      }
      if (parent.groupTrackingMethod === "Mixed") {
        if (!trackingValues.includes(SET_FILTER_SPECIAL.mixed))
          trackingValues.push(SET_FILTER_SPECIAL.mixed);
      }
      parent = parent.parentId ? displayedById.get(parent.parentId) : undefined;
    }
    context.assetClass.valuesByAccountId.set(row.id, classValues);
    context.trackingMethod.valuesByAccountId.set(row.id, trackingValues);
    context.path.valuesByAccountId.set(row.id, [
      groupId ? setFilterEntityKey(groupId) : SET_FILTER_SPECIAL.topLevel,
    ]);
  }

  context.assetClass.options = buildHierarchySetFilterOptions(
    classes,
    usedClasses,
  );
  context.path.options = buildHierarchySetFilterOptions(
    groups.map((row) => ({
      id: row.id,
      name: row.name,
      parentId:
        row.persistedParentId !== undefined
          ? row.persistedParentId
          : (row.parentId ?? null),
      sortOrder: row.sortOrder ?? 0,
    })),
    usedGroups,
  );
  for (const dimension of ["assetClass", "path"] as const) {
    const specials = new Set(
      [...context[dimension].valuesByAccountId.values()].flat(),
    );
    for (const [key, label] of [
      [SET_FILTER_SPECIAL.unclassified, "Unclassified"],
      [SET_FILTER_SPECIAL.topLevel, "Top Level"],
      [SET_FILTER_SPECIAL.mixed, "Mixed"],
    ]) {
      if (specials.has(key))
        addSetFilterOption(context[dimension].options, key, label);
    }
  }
  for (const dimension of ["unitIdentifier", "trackingMethod"] as const) {
    const values = new Set(
      [...context[dimension].valuesByAccountId.values()].flat(),
    );
    for (const value of [...values].sort()) {
      addSetFilterOption(
        context[dimension].options,
        value,
        dimension === "unitIdentifier"
          ? value
          : value === SET_FILTER_SPECIAL.mixed
            ? "Mixed"
            : getAccountTrackingMethodLabel(value as TreeRow["trackingMethod"]),
      );
    }
  }
  return context;
}
