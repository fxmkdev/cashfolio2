import type { Unit } from "../../.prisma-client/enums";

export type OrganizeNodeRef = {
  id: string;
  nodeType: "account" | "accountGroup";
};

/** Real relationships only, including archived accounts and groups. */
export type OrganizeNode = OrganizeNodeRef & {
  name: string;
  parentId: string | null;
  sortOrder: number | null;
  isActive: boolean;
  isCashAccount: boolean;
  unit: Unit | null;
};

export type OrganizeActionAvailability = {
  archivable: boolean;
  archiveDisabledReason?: string;
  unarchivable: boolean;
  unarchiveDisabledReason?: string;
  deletable: boolean;
  deleteDisabledReason?: string;
};

export type OrganizeSnapshot = {
  nodes: OrganizeNode[];
  version: string;
  actionAvailability: Record<string, OrganizeActionAvailability>;
};
export type OrganizeLifecycleAction = "archive" | "unarchive" | "delete";
export type OrganizePlacement = "first" | "last" | "before" | "after";
export type OrganizeMove = {
  items: OrganizeNodeRef[];
  parentId: string | null;
  placement: OrganizePlacement;
  anchorId?: string;
};

export type OrganizeChange = OrganizeNodeRef &
  Pick<OrganizeNode, "parentId" | "sortOrder" | "isCashAccount">;
export type OrganizeMoveResult = {
  snapshot: OrganizeSnapshot;
  changed: boolean;
};
