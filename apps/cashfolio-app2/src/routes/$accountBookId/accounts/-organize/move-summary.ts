import type {
  OrganizeMove,
  OrganizeNode,
} from "@/shared/account-organize/types";
import { descendants, organizePath } from "@/shared/account-organize/tree";

export function moveSummary(nodes: OrganizeNode[], next: OrganizeNode[]) {
  const changed = next.filter(
    (node, i) => node.isCashAccount !== nodes[i].isCashAccount,
  );
  return changed.length
    ? `This move changes the Cash Account setting for ${changed.length} ${changed.length === 1 ? "item" : "items"}, including descendants, to match the destination group.`
    : "";
}

export function dragMoveSummary(
  nodes: OrganizeNode[],
  next: OrganizeNode[],
  move: OrganizeMove,
) {
  const destination = move.parentId
    ? organizePath(nodes, move.parentId)
    : "Top Level";
  const relative = move.anchorId
    ? `${move.placement} ${nodes.find((node) => node.id === move.anchorId)?.name} in `
    : "into ";
  const included = new Set(
    move.items.flatMap((item) => [...descendants(nodes, item.id)]),
  );
  const archivedDescendants = nodes.filter(
    (node) =>
      included.has(node.id) &&
      !node.isActive &&
      !move.items.some((item) => item.id === node.id),
  ).length;
  const count = included.size - move.items.length;
  return `Move ${move.items.length} ${move.items.length === 1 ? "item" : "items"} ${relative}${destination}. ${count} included descendants (${archivedDescendants} archived). ${moveSummary(nodes, next)}`.trim();
}
