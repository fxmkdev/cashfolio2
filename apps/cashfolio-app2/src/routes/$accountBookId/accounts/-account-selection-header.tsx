import { Checkbox } from "@mantine/core";
import { useCallback, useSyncExternalStore } from "react";
import type { CustomHeaderProps } from "ag-grid-react";
import type { GridApi, IRowNode } from "ag-grid-enterprise";
import { isBulkAccount } from "./-bulk-account-targets";
import type { AccountsGridRow } from "./-page-types";

function getFilteredAccounts(api: GridApi<AccountsGridRow>) {
  const nodes: IRowNode<AccountsGridRow>[] = [];
  api.forEachNodeAfterFilter((node) => {
    if (isBulkAccount(node.data)) nodes.push(node);
  });
  return nodes;
}

export function AccountSelectionHeader({
  api,
}: CustomHeaderProps<AccountsGridRow>) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const events = ["selectionChanged", "modelUpdated"] as const;
      for (const event of events) api.addEventListener(event, onChange);
      return () => {
        for (const event of events) api.removeEventListener(event, onChange);
      };
    },
    [api],
  );
  const getSnapshot = useCallback(() => {
    const nodes = getFilteredAccounts(api);
    if (!nodes.length) return "disabled";
    const selectedCount = nodes.filter((node) => node.isSelected()).length;
    if (selectedCount === nodes.length) return "checked";
    return selectedCount ? "indeterminate" : "unchecked";
  }, [api]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return (
    <Checkbox
      aria-label="Select All Accounts"
      checked={state === "checked"}
      indeterminate={state === "indeterminate"}
      disabled={state === "disabled"}
      onKeyDown={(event) => event.stopPropagation()}
      onChange={() => {
        const nodes = getFilteredAccounts(api);
        api.deselectAll();
        if (state !== "checked")
          api.setNodesSelected({ nodes, newValue: true });
      }}
    />
  );
}
