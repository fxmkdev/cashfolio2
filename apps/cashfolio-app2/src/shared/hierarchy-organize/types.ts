import type { OrganizeNode as AccountNode } from "../account-organize/types";
export type {
  OrganizeActionAvailability,
  OrganizeLifecycleAction,
  OrganizePlacement,
} from "../account-organize/types";
import type {
  OrganizeActionAvailability,
  OrganizePlacement,
} from "../account-organize/types";

export type HierarchyNode = {
  id: string;
  nodeType: "account" | "accountGroup" | "assetClass";
  name: string;
  parentId: string | null;
  sortOrder: number | null;
  isActive?: boolean;
};
export type AssetClassOrganizeNode = HierarchyNode & {
  nodeType: "assetClass";
  sortOrder: number;
  activeCount: number;
  archivedCount: number;
  isActive?: never;
  isCashAccount?: never;
  unit?: never;
};
export type OrganizeNode = AccountNode | AssetClassOrganizeNode;
export type OrganizeNodeRef = Pick<HierarchyNode, "id" | "nodeType">;
export type OrganizeMove = {
  items: OrganizeNodeRef[];
  parentId: string | null;
  placement: OrganizePlacement;
  anchorId?: string;
};
export type OrganizeSnapshot = {
  nodes: OrganizeNode[];
  version: string;
  actionAvailability: Record<string, OrganizeActionAvailability>;
};
export type OrganizeMoveResult = {
  snapshot: OrganizeSnapshot;
  changed: boolean;
};

export function canContainChildren(node: Pick<HierarchyNode, "nodeType">) {
  return node.nodeType !== "account";
}
