export function isVirtualArchivedGroup(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    "isVirtualArchivedGroup" in data &&
    data.isVirtualArchivedGroup === true
  );
}

/** Stable partition after column sorting so Archived always follows real siblings. */
export function keepArchivedGroupsLast<T extends { data?: unknown }>(
  nodes: T[],
): void {
  const real = nodes.filter((node) => !isVirtualArchivedGroup(node.data));
  const archived = nodes.filter((node) => isVirtualArchivedGroup(node.data));
  nodes.splice(0, nodes.length, ...real, ...archived);
}
import type { PostSortRowsParams } from "ag-grid-enterprise";
import type { AccountsGridRow } from "./-page-types";

export function postSortAccountRows({
  nodes,
}: PostSortRowsParams<AccountsGridRow>) {
  keepArchivedGroupsLast(nodes);
}
