import { expect, it } from "vitest";
import {
  assetClassOptions,
  classificationOptions,
  defaultAssetClassNodes,
  getAssetClassLabel,
} from "./asset-class";

it("offers broad parents and specific children with complete hierarchy paths", () => {
  expect(defaultAssetClassNodes).toHaveLength(24);
  expect(assetClassOptions.slice(0, 6)).toEqual([
    { value: "CASH_AND_CASH_EQUIVALENTS", label: "Cash & Cash Equivalents" },
    {
      value: "BANK_DEPOSITS",
      label: "Cash & Cash Equivalents / Bank Deposits",
    },
    {
      value: "PHYSICAL_CASH",
      label: "Cash & Cash Equivalents / Physical Cash",
    },
    {
      value: "MONEY_MARKET_INVESTMENTS",
      label: "Cash & Cash Equivalents / Money Market Investments",
    },
    { value: "EQUITIES", label: "Equities" },
    { value: "LISTED_EQUITIES", label: "Equities / Listed Equities" },
  ]);
  expect(getAssetClassLabel("EQUITIES")).toBe("Equities");
  expect(getAssetClassLabel("CRYPTOCURRENCIES")).toBe(
    "Digital Assets / Cryptocurrencies",
  );
  expect(getAssetClassLabel(null)).toBe("Unclassified");
});

it("uses a book's own names and hierarchy without adding default children", () => {
  const nodes = [
    { id: "EQUITIES", name: "My Shares", parentId: null, sortOrder: 0 },
    {
      id: "BANK_DEPOSITS",
      name: "Custom Holding",
      parentId: "EQUITIES",
      sortOrder: 0,
    },
  ];
  expect(classificationOptions(nodes)).toEqual([
    { value: "EQUITIES", label: "My Shares", depth: 0 },
    { value: "BANK_DEPOSITS", label: "My Shares / Custom Holding", depth: 1 },
  ]);
  expect(getAssetClassLabel("BANK_DEPOSITS", nodes)).toBe(
    "My Shares / Custom Holding",
  );
  expect(getAssetClassLabel("CRYPTOCURRENCIES", nodes)).toBe("Unclassified");
});
