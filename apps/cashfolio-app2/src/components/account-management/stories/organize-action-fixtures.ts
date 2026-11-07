import type { OrganizeNode } from "@/shared/account-organize/types";
import { activeAssetRows, archivedAssetRows } from "./fixtures";

export function organizeAccountNodes(archived = false): OrganizeNode[] {
  return (archived ? archivedAssetRows : activeAssetRows).map((row) => ({
    id: row.id,
    name: row.name,
    nodeType: row.nodeType,
    parentId: row.parentId ?? null,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    isCashAccount: true,
    unit: row.unit,
  }));
}
