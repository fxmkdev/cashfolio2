import type { Unit } from "../../.prisma-client/enums";

export type OrganizeNodeRef = {
  id: string;
  nodeType: "account" | "accountGroup";
};

/** Real relationships only. Virtual Archived rows belong to the presentation. */
export type OrganizeNode = OrganizeNodeRef & {
  name: string;
  parentId: string | null;
  sortOrder: number | null;
  isActive: boolean;
  isCashAccount: boolean;
  unit: Unit | null;
};

export type OrganizeSnapshot = { nodes: OrganizeNode[]; version: string };
export type OrganizePlacement = "first" | "last" | "before" | "after";
export type OrganizeMove = {
  items: OrganizeNodeRef[];
  parentId: string | null;
  placement: OrganizePlacement;
  anchorId?: string;
};

export type OrganizeRestore = OrganizeNodeRef &
  Pick<OrganizeNode, "parentId" | "sortOrder" | "isCashAccount">;
export type OrganizeUndo = {
  version: string;
  restore: OrganizeRestore[];
};
export type OrganizeMoveResult = {
  snapshot: OrganizeSnapshot;
  undo: OrganizeUndo | null;
};
