import type { ColDef } from "ag-grid-enterprise";
import type { OrganizeNode } from "@/shared/hierarchy-organize/types";
import type { OrganizeDisplayRow } from "@/shared/hierarchy-organize/tree";
import type { useExpandedGroups } from "@/hooks/use-expanded-groups";

export type HierarchyCreation = {
  editorOpened: boolean;
  onAddChild: (node: OrganizeNode) => void;
  onAddGroup: (node: OrganizeNode) => void;
  onInteractionBlockedChange: (blocked: boolean) => void;
};

/** Management pages expose editors alongside structural operations. */
export type HierarchyManagement = {
  editorOpened: boolean;
  addChildLabel?: string;
  onEdit: (node: OrganizeNode) => void;
  onAddChild: (node: OrganizeNode) => void;
  onAddGroup?: (node: OrganizeNode) => void;
  onOpenLeaf?: (id: string) => void;
  columns?: ColDef<OrganizeDisplayRow>[];
  expansion?: ReturnType<typeof useExpandedGroups>;
  showArchived?: boolean;
  onInteractionBlockedChange?: (blocked: boolean) => void;
};
