import { useCallback, useRef } from "react";
import type {
  IsGroupOpenByDefaultParams,
  RowGroupOpenedEvent,
} from "ag-grid-enterprise";

export function useExpandedGroups(storageKey: string) {
  const storageKeyRef = useRef(storageKey);
  storageKeyRef.current = storageKey;

  const isGroupOpenByDefault = useCallback(
    (params: IsGroupOpenByDefaultParams) => {
      const stored = sessionStorage.getItem(storageKeyRef.current);
      if (stored == null) return params.rowNode.level === 0;
      const expandedIds: string[] = JSON.parse(stored);
      return expandedIds.includes(params.rowNode.key!);
    },
    [],
  );

  const onRowGroupOpened = useCallback((event: RowGroupOpenedEvent) => {
    const expandedIds: string[] = [];
    event.api.forEachNode((node) => {
      if (node.group && node.expanded && node.key) {
        expandedIds.push(node.key);
      }
    });
    sessionStorage.setItem(storageKeyRef.current, JSON.stringify(expandedIds));
  }, []);

  return { isGroupOpenByDefault, onRowGroupOpened };
}
