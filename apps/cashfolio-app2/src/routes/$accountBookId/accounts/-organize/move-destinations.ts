import type { GroupTreeOption } from "@/components/account-tree/group-tree-select";
import { planAccountMove } from "@/shared/account-organize/move";
import { compareOrganizeNodes } from "@/shared/account-organize/tree";
import type {
  OrganizeNode,
  OrganizeNodeRef,
} from "@/shared/account-organize/types";

export const TOP_LEVEL_DESTINATION = "__top_level__";

export function moveDestinationGroups(
  nodes: OrganizeNode[],
  items: OrganizeNodeRef[],
  showArchived: boolean,
): GroupTreeOption[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const choices: GroupTreeOption[] = [
    {
      value: TOP_LEVEL_DESTINATION,
      label: "Top Level",
      treeLabel: "Top Level",
      treePath: [],
    },
    ...nodes
      .filter(
        (node) =>
          node.nodeType === "accountGroup" && (showArchived || node.isActive),
      )
      .sort(compareOrganizeNodes)
      .map((node) => {
        const treePath: string[] = [];
        const visited = new Set([node.id]);
        let parent = node.parentId ? byId.get(node.parentId) : undefined;
        while (parent && !visited.has(parent.id)) {
          visited.add(parent.id);
          treePath.unshift(parent.name);
          parent = parent.parentId ? byId.get(parent.parentId) : undefined;
        }
        return {
          value: node.id,
          parentGroupId: node.parentId,
          label: [...treePath, node.name].join(" / "),
          treePath,
          treeLabel: `${node.name}${node.isActive ? "" : " (Archived)"}`,
        };
      }),
  ];
  return choices.filter((option) => {
    try {
      planAccountMove(nodes, {
        items,
        parentId: option.value === TOP_LEVEL_DESTINATION ? null : option.value,
        placement: "last",
      });
      return true;
    } catch {
      return false;
    }
  });
}
