import type { TreeNodeData } from "@mantine/core";
import type {
  HistoryScopeOption,
  HistoryScopeSelection,
} from "@/shared/history-scope";

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
