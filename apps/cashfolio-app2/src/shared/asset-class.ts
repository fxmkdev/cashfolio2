/** Stable IDs used only to initialize a book and preserve legacy History links. */
export const defaultAssetClassIds = {
  CASH_AND_CASH_EQUIVALENTS: "CASH_AND_CASH_EQUIVALENTS",
  EQUITIES: "EQUITIES",
  FIXED_INCOME: "FIXED_INCOME",
  REAL_ESTATE: "REAL_ESTATE",
  COMMODITIES_AND_PRECIOUS_METALS: "COMMODITIES_AND_PRECIOUS_METALS",
  DIGITAL_ASSETS: "DIGITAL_ASSETS",
  ALTERNATIVE_INVESTMENTS: "ALTERNATIVE_INVESTMENTS",
  OTHER_ASSETS: "OTHER_ASSETS",
} as const;
export const ASSET_CLASS_SCHEME_ID = "assetClass";
export type ClassificationNode = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
};
export const assetClassLabels: Record<string, string> = {
  CASH_AND_CASH_EQUIVALENTS: "Cash & Cash Equivalents",
  EQUITIES: "Equities",
  FIXED_INCOME: "Fixed Income",
  REAL_ESTATE: "Real Estate",
  COMMODITIES_AND_PRECIOUS_METALS: "Commodities & Precious Metals",
  DIGITAL_ASSETS: "Digital Assets",
  ALTERNATIVE_INVESTMENTS: "Alternative Investments",
  OTHER_ASSETS: "Other Assets",
};
export const defaultAssetClassNodes: ClassificationNode[] = Object.entries(
  assetClassLabels,
).map(([id, name], sortOrder) => ({ id, name, parentId: null, sortOrder }));
/** Default fixtures and seed data only; live selectors use book-specific nodes. */
export const assetClassOptions = defaultAssetClassNodes.map((n) => ({
  value: n.id,
  label: n.name,
}));

export function classificationOptions(nodes: readonly ClassificationNode[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const path = (node: ClassificationNode): string => {
    const names: string[] = [];
    const seen = new Set<string>();
    let current: ClassificationNode | undefined = node;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      names.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return names.join(" / ");
  };
  const result: Array<{ value: string; label: string; depth: number }> = [];
  const visited = new Set<string>();
  const append = (parentId: string | null, depth: number) => {
    for (const node of nodes
      .filter((n) => n.parentId === parentId)
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.name.localeCompare(b.name) ||
          a.id.localeCompare(b.id),
      )) {
      if (visited.has(node.id)) continue;
      visited.add(node.id);
      result.push({ value: node.id, label: path(node), depth });
      append(node.id, depth + 1);
    }
  };
  append(null, 0);
  return result;
}
export function getAssetClassLabel(
  id: string | null | undefined,
  nodes: readonly ClassificationNode[] = defaultAssetClassNodes,
): string {
  return id == null
    ? "Unclassified"
    : (classificationOptions(nodes).find((n) => n.value === id)?.label ??
        "Unclassified");
}
