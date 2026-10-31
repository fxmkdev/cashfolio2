import { assetClassOptions } from "../../../shared/asset-class";
import type { PeriodGroupNode } from "./period-breakdown-state";

export const UNATTRIBUTED_GROUP_ID = "virtual:gain-loss-unattributed";

export function buildAssetClassGroups(): Map<string, PeriodGroupNode> {
  return new Map(
    [
      ...assetClassOptions,
      { value: "unclassified", label: "Unclassified" },
    ].map(({ value, label }) => [
      value,
      { id: value, name: label, parentGroupId: null },
    ]),
  );
}
