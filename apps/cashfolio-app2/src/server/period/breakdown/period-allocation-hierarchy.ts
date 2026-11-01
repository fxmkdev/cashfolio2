import {
  classificationOptions,
  defaultAssetClassNodes,
  type ClassificationNode,
} from "../../../shared/asset-class";
import type { Money } from "../../../shared/money";
import type { ReportingGrouping } from "../../../shared/reporting-grouping";
import { buildAssetClassGroups } from "./period-reporting-groups";
import {
  type PeriodGroupNode,
  resolveGroupPathToRoot,
} from "./period-breakdown-state";
import {
  UNKNOWN_GAIN_LOSS_UNIT,
  type GainLossInvestmentGroup,
} from "../../../shared/investment-group";
import { buildBreakdownHierarchyWithMeta } from "./period-breakdown-hierarchy";

export type AllocationHierarchyItem = {
  accountId: string;
  accountName: string;
  groupId: string | null;
  assetClassId?: string | null;
  investmentGroup?: GainLossInvestmentGroup;
  amount: Money;
};

function getAllocationReportingNodeId(id: string): string {
  return id.startsWith("group:allocation-investment:")
    ? id.slice(6)
    : id.replace(/^group:/, "asset-class:");
}

function formatAssetClassHierarchy(
  result: ReturnType<typeof buildBreakdownHierarchyWithMeta>,
  assetClasses: readonly ClassificationNode[],
  accountGroupPaths: Map<string, string[]>,
) {
  const classes = [
    ...classificationOptions(assetClasses).map((node) => node.value),
    "unclassified",
  ];
  const classOrder = new Map(
    classes.map((id, index) => [`group:${id}`, index]),
  );
  const updateNodes = (nodes: typeof result.hierarchy) => {
    nodes.sort(
      (a, b) =>
        (classOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (classOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
    for (const node of nodes) {
      if (node.kind === "group")
        node.id = getAllocationReportingNodeId(node.id);
      const accountGroupPath = accountGroupPaths.get(node.id);
      if (accountGroupPath) node.accountGroupPath = accountGroupPath;
      updateNodes(node.children);
    }
  };
  updateNodes(result.hierarchy);
  result.hiddenAmountDiscrepancyNodeIds =
    result.hiddenAmountDiscrepancyNodeIds.map(getAllocationReportingNodeId);
  return result;
}

export function buildAllocationHierarchy(args: {
  items: AllocationHierarchyItem[];
  grouping?: ReportingGrouping;
  assetClasses?: readonly ClassificationNode[];
  groupById: Map<string, PeriodGroupNode>;
}) {
  if (args.grouping !== "assetClass") {
    return buildBreakdownHierarchyWithMeta(args);
  }

  const assetClasses = args.assetClasses ?? defaultAssetClassNodes;
  const assetClassGroups = buildAssetClassGroups(assetClasses);
  const allocationGroups = new Map(assetClassGroups);
  const accountGroupPaths = new Map<string, string[]>();
  const items = args.items.map((item) => {
    const classId =
      item.assetClassId && assetClassGroups.has(item.assetClassId)
        ? item.assetClassId
        : "unclassified";
    const investment = item.investmentGroup ?? UNKNOWN_GAIN_LOSS_UNIT;
    const groupId = `allocation-investment:${classId}:${investment.key}`;
    allocationGroups.set(groupId, {
      id: groupId,
      name: investment.label,
      parentGroupId: classId,
    });
    if (!item.accountId.startsWith("virtual:")) {
      accountGroupPaths.set(
        `account:${item.accountId}`,
        item.groupId
          ? resolveGroupPathToRoot({
              groupId: item.groupId,
              groupById: args.groupById,
            })
              .reverse()
              .map((group) => group.name)
          : [],
      );
    }
    return { ...item, groupId };
  });

  return formatAssetClassHierarchy(
    buildBreakdownHierarchyWithMeta({ items, groupById: allocationGroups }),
    assetClasses,
    accountGroupPaths,
  );
}
