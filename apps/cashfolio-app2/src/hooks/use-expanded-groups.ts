import { useCallback, useRef } from "react";
import type {
  IsGroupOpenByDefaultParams,
  RowGroupOpenedEvent,
} from "ag-grid-enterprise";

function parseStoredExpandedIds(stored: string): string[] | null {
  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return null;
    }

    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return null;
  }
}

export function useExpandedGroups(
  storageKey: string,
  isInitiallyCollapsed?: (data: unknown) => boolean,
  preserveMissingGroups = false,
) {
  const storageKeyRef = useRef(storageKey);
  storageKeyRef.current = storageKey;
  const preserveMissingGroupsRef = useRef(preserveMissingGroups);
  preserveMissingGroupsRef.current = preserveMissingGroups;

  const isGroupOpenByDefault = useCallback(
    (params: IsGroupOpenByDefaultParams) => {
      const defaultIsOpen =
        params.rowNode.level === 0 &&
        !isInitiallyCollapsed?.(params.rowNode.data);
      let stored: string | null;
      try {
        stored = sessionStorage.getItem(storageKeyRef.current);
      } catch {
        return defaultIsOpen;
      }

      if (stored == null) {
        return defaultIsOpen;
      }

      const expandedIds = parseStoredExpandedIds(stored);
      if (expandedIds == null) {
        try {
          sessionStorage.removeItem(storageKeyRef.current);
        } catch {
          // Ignore storage cleanup failures.
        }
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
    const presentGroups = new Set<string>();
    event.api.forEachNode((node) => {
      if (node.group && node.key) {
        presentGroups.add(node.key);
        if (node.expanded) expandedIds.push(node.key);
      }
    });

    try {
      if (preserveMissingGroupsRef.current) {
        const stored = sessionStorage.getItem(storageKeyRef.current);
        const previous =
          stored == null ? [] : (parseStoredExpandedIds(stored) ?? []);
        expandedIds.push(...previous.filter((id) => !presentGroups.has(id)));
      }
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
