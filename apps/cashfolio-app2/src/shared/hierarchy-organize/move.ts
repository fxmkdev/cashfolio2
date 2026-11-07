import { planAccountMove } from "../account-organize/move";
import { validateClassificationChange } from "../classification-rules";
import { planStructuralMove } from "./structure";
import type {
  AssetClassOrganizeNode,
  OrganizeMove,
  OrganizeNode,
} from "./types";

export function planAssetClassMove(
  nodes: AssetClassOrganizeNode[],
  move: OrganizeMove,
) {
  const next = planStructuralMove(nodes, move);
  for (const node of next) validateClassificationChange(next, node);
  return next;
}

/** Domain policies run identically for browser previews and server writes. */
export function planOrganizeMove(
  nodes: OrganizeNode[],
  move: OrganizeMove,
): OrganizeNode[] {
  if (
    nodes.every(
      (node): node is AssetClassOrganizeNode => node.nodeType === "assetClass",
    )
  )
    return planAssetClassMove(nodes, move);
  const accounts = nodes.filter((node) => node.nodeType !== "assetClass");
  if (
    accounts.length !== nodes.length ||
    move.items.some((item) => item.nodeType === "assetClass")
  )
    throw new Error("Choose items from the same hierarchy.");
  const next = planAccountMove(accounts, {
    ...move,
    items: move.items.map((item) => {
      if (item.nodeType === "assetClass")
        throw new Error("Choose an account or group.");
      return { ...item, nodeType: item.nodeType };
    }),
  });
  return next === accounts ? nodes : next;
}
