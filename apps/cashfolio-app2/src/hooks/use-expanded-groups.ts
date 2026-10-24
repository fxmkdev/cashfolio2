import { useCallback, useRef } from "react";
import { readExpandedGroupPreference } from "../shared/expanded-group-preference";
import type {
  IsGroupOpenByDefaultParams,
  RowGroupOpenedEvent,
} from "ag-grid-enterprise";

export function useExpandedGroups(
  storageKey: string,
  isInitiallyCollapsed?: (data: unknown) => boolean,
  legacyStorageKeys?: readonly string[],
) {
  const storageKeyRef = useRef(storageKey);
  storageKeyRef.current = storageKey;
  const legacyStorageKeysRef = useRef(legacyStorageKeys);
  legacyStorageKeysRef.current = legacyStorageKeys;

  const isGroupOpenByDefault = useCallback(
    (params: IsGroupOpenByDefaultParams) => {
      const defaultIsOpen =
        params.rowNode.level === 0 &&
        !isInitiallyCollapsed?.(params.rowNode.data);
      let expandedIds: string[] | null;
      try {
        expandedIds = readExpandedGroupPreference(
          sessionStorage,
          storageKeyRef.current,
          legacyStorageKeysRef.current,
        );
      } catch {
        return defaultIsOpen;
      }
      if (expandedIds == null) {
        return defaultIsOpen;
      }

      const rowKey = params.rowNode.key;
      if (rowKey == null) {
        return defaultIsOpen;
      }

      return expandedIds.includes(rowKey);
    },
    [isInitiallyCollapsed],
  );

  const onRowGroupOpened = useCallback((event: RowGroupOpenedEvent) => {
    const expandedIds: string[] = [];
    event.api.forEachNode((node) => {
      if (node.group && node.expanded && node.key) {
        expandedIds.push(node.key);
      }
    });

    try {
      sessionStorage.setItem(
        storageKeyRef.current,
        JSON.stringify(expandedIds),
      );
    } catch {
      // Ignore storage persistence failures.
    }
  }, []);

  return { isGroupOpenByDefault, onRowGroupOpened };
}
