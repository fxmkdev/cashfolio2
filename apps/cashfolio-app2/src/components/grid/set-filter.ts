import type { ISetFilterParams } from "ag-grid-enterprise";

export const SET_FILTER_SPECIAL = {
  unclassified: "special:unclassified",
  mixed: "special:mixed",
  topLevel: "special:top-level",
  direct: "special:direct",
} as const;

export const setFilterEntityKey = (id: string) => `entity:${id}`;

export type SetFilterOptions = {
  values: string[];
  paths: Map<string, string[]>;
  labels: Map<string, string>;
};

type HierarchyNode = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
};

/** Values are entity IDs; labels and paths never participate in identity. */
export function buildHierarchySetFilterOptions(
  nodes: readonly HierarchyNode[],
  usedIds: ReadonlySet<string>,
): SetFilterOptions {
  const ids = new Set(nodes.map((node) => node.id));
  const normalized = nodes.map((node) =>
    node.parentId !== null && !ids.has(node.parentId)
      ? { ...node, parentId: null }
      : node,
  );
  const parents = new Set(nodes.map((node) => node.parentId));
  const options: SetFilterOptions = {
    values: [],
    paths: new Map(),
    labels: new Map([[SET_FILTER_SPECIAL.direct, "Directly Assigned"]]),
  };
  const visited = new Set<string>();
  const append = (parentId: string | null, path: string[]) => {
    for (const node of normalized
      .filter((node) => node.parentId === parentId)
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.name.localeCompare(b.name) ||
          a.id.localeCompare(b.id),
      )) {
      if (visited.has(node.id)) continue;
      visited.add(node.id);
      const key = setFilterEntityKey(node.id);
      const nodePath = [...path, key];
      options.labels.set(key, node.name);
      if (usedIds.has(node.id)) {
        options.values.push(key);
        options.paths.set(
          key,
          parents.has(node.id)
            ? [...nodePath, SET_FILTER_SPECIAL.direct]
            : nodePath,
        );
      }
      append(node.id, nodePath);
    }
  };
  append(null, []);
  return options;
}

export function addSetFilterOption(
  options: SetFilterOptions,
  key: string,
  label: string,
) {
  options.values.push(key);
  options.paths.set(key, [key]);
  options.labels.set(key, label);
}

/** Keep these callbacks stable; AG Grid resets models when their identity changes. */
export function createSetFilterParams<TData>(
  getOptions: () => SetFilterOptions,
  hierarchical = false,
) {
  return {
    values: (params) => params.success(getOptions().values),
    // Row updates refresh supplied values. Refreshing again as the popup opens
    // can restore its old selection while the user is already changing it.
    suppressClearModelOnRefreshValues: true,
    suppressSorting: true,
    caseSensitive: true,
    textFormatter: (text) => text.toLocaleLowerCase(),
    valueFormatter: ({ value }) =>
      value == null ? "" : (getOptions().labels.get(value) ?? value),
    ...(hierarchical
      ? {
          treeList: true,
          treeListPathGetter: (value: string | null) =>
            value == null ? null : (getOptions().paths.get(value) ?? null),
          treeListFormatter: (pathKey: string | null) =>
            pathKey == null
              ? ""
              : (getOptions().labels.get(pathKey) ?? pathKey),
        }
      : {}),
  } satisfies Partial<ISetFilterParams<TData, string>>;
}
