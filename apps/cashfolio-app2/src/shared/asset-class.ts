/** Stable IDs used only to initialize a book and preserve legacy History links. */
export const defaultAssetClassIds = {
  CASH_AND_CASH_EQUIVALENTS: "CASH_AND_CASH_EQUIVALENTS",
  EQUITIES: "EQUITIES",
  FIXED_INCOME: "FIXED_INCOME",
  REAL_ESTATE: "REAL_ESTATE",
  COMMODITIES_AND_PRECIOUS_METALS: "COMMODITIES_AND_PRECIOUS_METALS",
  DIGITAL_ASSETS: "DIGITAL_ASSETS",
  ALTERNATIVE_INVESTMENTS: "ALTERNATIVE_INVESTMENTS",
  MULTI_ASSET_INVESTMENTS: "MULTI_ASSET_INVESTMENTS",
  OTHER_ASSETS: "OTHER_ASSETS",
  BANK_DEPOSITS: "BANK_DEPOSITS",
  PHYSICAL_CASH: "PHYSICAL_CASH",
  MONEY_MARKET_INVESTMENTS: "MONEY_MARKET_INVESTMENTS",
  LISTED_EQUITIES: "LISTED_EQUITIES",
  PRIVATE_EQUITY: "PRIVATE_EQUITY",
  GOVERNMENT_BONDS: "GOVERNMENT_BONDS",
  CORPORATE_BONDS: "CORPORATE_BONDS",
  DIRECT_PROPERTY: "DIRECT_PROPERTY",
  REAL_ESTATE_FUNDS: "REAL_ESTATE_FUNDS",
  PRECIOUS_METALS: "PRECIOUS_METALS",
  OTHER_COMMODITIES: "OTHER_COMMODITIES",
  CRYPTOCURRENCIES: "CRYPTOCURRENCIES",
  OTHER_DIGITAL_ASSETS: "OTHER_DIGITAL_ASSETS",
  HEDGE_FUNDS: "HEDGE_FUNDS",
  STRUCTURED_PRODUCTS: "STRUCTURED_PRODUCTS",
} as const;
export const ASSET_CLASS_SCHEME_ID = "assetClass";
export type ClassificationNode = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
};
export const defaultAssetClassNodes: ClassificationNode[] = [
  {
    id: "CASH_AND_CASH_EQUIVALENTS",
    name: "Cash & Cash Equivalents",
    parentId: null,
    sortOrder: 0,
  },
  { id: "EQUITIES", name: "Equities", parentId: null, sortOrder: 1 },
  { id: "FIXED_INCOME", name: "Fixed Income", parentId: null, sortOrder: 2 },
  { id: "REAL_ESTATE", name: "Real Estate", parentId: null, sortOrder: 3 },
  {
    id: "COMMODITIES_AND_PRECIOUS_METALS",
    name: "Commodities & Precious Metals",
    parentId: null,
    sortOrder: 4,
  },
  {
    id: "DIGITAL_ASSETS",
    name: "Digital Assets",
    parentId: null,
    sortOrder: 5,
  },
  {
    id: "ALTERNATIVE_INVESTMENTS",
    name: "Alternative Investments",
    parentId: null,
    sortOrder: 6,
  },
  {
    id: "MULTI_ASSET_INVESTMENTS",
    name: "Multi-Asset Investments",
    parentId: null,
    sortOrder: 7,
  },
  { id: "OTHER_ASSETS", name: "Other Assets", parentId: null, sortOrder: 8 },
  {
    id: "BANK_DEPOSITS",
    name: "Bank Deposits",
    parentId: "CASH_AND_CASH_EQUIVALENTS",
    sortOrder: 0,
  },
  {
    id: "PHYSICAL_CASH",
    name: "Physical Cash",
    parentId: "CASH_AND_CASH_EQUIVALENTS",
    sortOrder: 1,
  },
  {
    id: "MONEY_MARKET_INVESTMENTS",
    name: "Money Market Investments",
    parentId: "CASH_AND_CASH_EQUIVALENTS",
    sortOrder: 2,
  },
  {
    id: "LISTED_EQUITIES",
    name: "Listed Equities",
    parentId: "EQUITIES",
    sortOrder: 0,
  },
  {
    id: "PRIVATE_EQUITY",
    name: "Private Equity",
    parentId: "EQUITIES",
    sortOrder: 1,
  },
  {
    id: "GOVERNMENT_BONDS",
    name: "Government Bonds",
    parentId: "FIXED_INCOME",
    sortOrder: 0,
  },
  {
    id: "CORPORATE_BONDS",
    name: "Corporate Bonds",
    parentId: "FIXED_INCOME",
    sortOrder: 1,
  },
  {
    id: "DIRECT_PROPERTY",
    name: "Direct Property",
    parentId: "REAL_ESTATE",
    sortOrder: 0,
  },
  {
    id: "REAL_ESTATE_FUNDS",
    name: "Real Estate Funds",
    parentId: "REAL_ESTATE",
    sortOrder: 1,
  },
  {
    id: "PRECIOUS_METALS",
    name: "Precious Metals",
    parentId: "COMMODITIES_AND_PRECIOUS_METALS",
    sortOrder: 0,
  },
  {
    id: "OTHER_COMMODITIES",
    name: "Other Commodities",
    parentId: "COMMODITIES_AND_PRECIOUS_METALS",
    sortOrder: 1,
  },
  {
    id: "CRYPTOCURRENCIES",
    name: "Cryptocurrencies",
    parentId: "DIGITAL_ASSETS",
    sortOrder: 0,
  },
  {
    id: "OTHER_DIGITAL_ASSETS",
    name: "Other Digital Assets",
    parentId: "DIGITAL_ASSETS",
    sortOrder: 1,
  },
  {
    id: "HEDGE_FUNDS",
    name: "Hedge Funds",
    parentId: "ALTERNATIVE_INVESTMENTS",
    sortOrder: 0,
  },
  {
    id: "STRUCTURED_PRODUCTS",
    name: "Structured Products",
    parentId: "ALTERNATIVE_INVESTMENTS",
    sortOrder: 1,
  },
];
export const assetClassLabels: Record<string, string> = Object.fromEntries(
  defaultAssetClassNodes.map((node) => [node.id, node.name]),
);
/** Default fixtures and seed data only; live selectors use book-specific nodes. */
export const assetClassOptions = classificationOptions(
  defaultAssetClassNodes,
).map(({ value, label }) => ({ value, label }));

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
