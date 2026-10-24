import { AssetClass } from "../.prisma-client/enums";

export const assetClassLabels: Record<AssetClass, string> = {
  CASH_AND_CASH_EQUIVALENTS: "Cash & Cash Equivalents",
  EQUITIES: "Equities",
  FIXED_INCOME: "Fixed Income",
  REAL_ESTATE: "Real Estate",
  COMMODITIES_AND_PRECIOUS_METALS: "Commodities & Precious Metals",
  DIGITAL_ASSETS: "Digital Assets",
  ALTERNATIVE_INVESTMENTS: "Alternative Investments",
  OTHER_ASSETS: "Other Assets",
};

export const assetClassOptions = Object.values(AssetClass).map((value) => ({
  value,
  label: assetClassLabels[value],
}));
