import type { TreeNodeData } from "@mantine/core";
import { reportingGroupingOptions } from "@/shared/reporting-grouping";
import {
  isHistoryScopedMetric,
  parseHistoryScopeSelection,
  type HistoryScopeOption,
  type HistoryScopeSelection,
  type HistoryScopedMetric,
} from "@/shared/history-scope";

import {
  HISTORY_METRIC_OPTIONS,
  isHistoryMetric,
  type HistoryViewSelection,
} from "./-page-types";

type HistoryScopeOptions = Record<HistoryScopedMetric, HistoryScopeOption[]>;

export function isHistoryGroupingBranch(value: string): boolean {
  return reportingGroupingOptions.some(
    ({ value: grouping }) => value === `gainsLosses:grouping:${grouping}`,
  );
}

export function getHistoryViewTreeValue(
  selection: HistoryViewSelection,
): string {
  return `${selection.metric}:${selection.scope}`;
}

export function getHistoryViewTreeSelection(
  value: string | null,
  scopeOptions: HistoryScopeOptions,
): HistoryViewSelection | undefined {
  if (!value) return undefined;

  const separator = value.indexOf(":");
  const metric = value.slice(0, separator);
  const scope = parseHistoryScopeSelection(value.slice(separator + 1));
  if (!isHistoryMetric(metric) || !scope) return undefined;

  if (
    scope !== "total" &&
    (!isHistoryScopedMetric(metric) ||
      !scopeOptions[metric].some((option) => option.value === scope))
  ) {
    return undefined;
  }

  return { metric, scope };
}

export function buildHistoryViewTreeData(
  scopeOptions: HistoryScopeOptions,
): TreeNodeData[] {
  return HISTORY_METRIC_OPTIONS.map(({ value: metric, label }) => {
    function namespaceNode(
      node: TreeNodeData,
      branchLabel?: string,
    ): TreeNodeData {
      return {
        ...node,
        value: `${metric}:${node.value}`,
        nodeProps: {
          searchLabel: `${label} / ${branchLabel ? `${branchLabel} / ` : ""}${getHistoryScopeTreeSearchLabel(node)}`,
        },
        ...(node.children
          ? {
              children: node.children.map((child) =>
                namespaceNode(child, branchLabel),
              ),
            }
          : {}),
      };
    }

    const children = isHistoryScopedMetric(metric)
      ? buildHistoryScopeTreeData(
          scopeOptions[metric].filter((option) => option.value !== "total"),
        ).map((node) => namespaceNode(node))
      : [];

    const groupedChildren =
      metric === "gainsLosses" && children.length > 0
        ? reportingGroupingOptions.map(
            ({ value: grouping, label: groupingLabel }) => ({
              value: `gainsLosses:grouping:${grouping}`,
              label: `By ${groupingLabel}`,
              nodeProps: { searchLabel: `${label} / By ${groupingLabel}` },
              children: buildHistoryScopeTreeData(
                scopeOptions.gainsLosses.filter(
                  (option) =>
                    option.value !== "total" &&
                    (option.grouping ?? "assetClass") === grouping,
                ),
              ).map((node) => namespaceNode(node, `By ${groupingLabel}`)),
            }),
          )
        : children;

    return {
      value: getHistoryViewTreeValue({ metric, scope: "total" }),
      label,
      nodeProps: { searchLabel: label },
      ...(groupedChildren.length > 0 ? { children: groupedChildren } : {}),
    };
  });
}

export function getHistoryScopeTreeSearchLabel(node: TreeNodeData): string {
  return typeof node.nodeProps?.searchLabel === "string"
    ? node.nodeProps.searchLabel
    : String(node.label);
}

function resolveSafeParentValue(
  option: HistoryScopeOption,
  optionByValue: Map<HistoryScopeSelection, HistoryScopeOption>,
): HistoryScopeSelection | undefined {
  if (!option.parentValue || !optionByValue.has(option.parentValue)) {
    return undefined;
  }

  const visitedValues = new Set<HistoryScopeSelection>([option.value]);
  let currentValue: HistoryScopeSelection | undefined = option.parentValue;

  while (currentValue) {
    if (visitedValues.has(currentValue)) {
      return undefined;
    }

    visitedValues.add(currentValue);
    const currentOption = optionByValue.get(currentValue);
    currentValue = currentOption?.parentValue;
  }

  return option.parentValue;
}

export function buildHistoryScopeTreeData(
  options: HistoryScopeOption[],
): TreeNodeData[] {
  const optionByValue = new Map(
    options.map((option) => [option.value, option]),
  );
  const nodeByValue = new Map<HistoryScopeSelection, TreeNodeData>(
    options.map((option) => [
      option.value,
      {
        value: option.value,
        label: option.treeLabel ?? option.label,
        nodeProps: { searchLabel: option.label },
      },
    ]),
  );
  const roots: TreeNodeData[] = [];

  for (const option of options) {
    const node = nodeByValue.get(option.value);
    if (!node) {
      continue;
    }

    const parentValue = resolveSafeParentValue(option, optionByValue);
    const parentNode = parentValue ? nodeByValue.get(parentValue) : undefined;

    if (!parentNode) {
      roots.push(node);
      continue;
    }

    parentNode.children = parentNode.children ?? [];
    parentNode.children.push(node);
  }

  return roots;
}
