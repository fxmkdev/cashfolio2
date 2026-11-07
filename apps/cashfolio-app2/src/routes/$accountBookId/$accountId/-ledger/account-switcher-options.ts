import { flattenTreeData, type TreeNodeData } from "@mantine/core";

/** Adapt public Tree metadata to the public TreeSelect row renderer. */
export function getLedgerAccountSwitcherOptions(
  data: TreeNodeData[],
  expandedState: Record<string, boolean>,
) {
  return flattenTreeData(data, expandedState).map((entry) => ({
    ...entry,
    lineGuides: entry.linesPath
      .slice(0, -1)
      .map((line) => line === "continuing"),
    isLastChild:
      entry.parent === null
        ? data.at(-1)?.value === entry.node.value
        : entry.linesPath.at(-1) === "closing",
  }));
}
