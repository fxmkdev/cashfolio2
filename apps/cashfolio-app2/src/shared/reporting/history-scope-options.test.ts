import { expect, it } from "vitest";
import type {
  HistoryScopeOption,
  HistoryScopeSelection,
} from "./history-scope";
import { sortGainLossScopeOptions } from "./history-scope-options";

it("uses only default roots for fallback ordering and keeps unknown roots last", () => {
  const values: HistoryScopeSelection[] = [
    "asset-class:BANK_DEPOSITS",
    "asset-class:unclassified",
    "asset-class:OTHER_ASSETS",
    "asset-class:MULTI_ASSET_INVESTMENTS",
    "asset-class:EQUITIES",
    "asset-class:CASH_AND_CASH_EQUIVALENTS",
  ];
  expect(
    sortGainLossScopeOptions(
      values.map((value) => ({ value, label: value, kind: "gainLoss" })),
    ).map((option) => option.value),
  ).toEqual([
    "asset-class:CASH_AND_CASH_EQUIVALENTS",
    "asset-class:EQUITIES",
    "asset-class:MULTI_ASSET_INVESTMENTS",
    "asset-class:OTHER_ASSETS",
    "asset-class:unclassified",
    "asset-class:BANK_DEPOSITS",
  ]);
});

it("honors book-specific ordering and nests scopes under their current parent", () => {
  const options: HistoryScopeOption[] = [
    {
      value: "asset-class:BANK_DEPOSITS",
      label: "My Deposits",
      kind: "gainLoss",
      parentValue: "asset-class:CASH_AND_CASH_EQUIVALENTS",
      sortOrder: 0,
    },
    {
      value: "asset-class:CASH_AND_CASH_EQUIVALENTS",
      label: "My Cash",
      kind: "gainLoss",
      sortOrder: 8,
    },
    {
      value: "asset-class:EQUITIES",
      label: "My Shares",
      kind: "gainLoss",
      sortOrder: 0,
    },
  ];
  expect(
    sortGainLossScopeOptions(options).map((option) => option.value),
  ).toEqual([
    "asset-class:EQUITIES",
    "asset-class:CASH_AND_CASH_EQUIVALENTS",
    "asset-class:BANK_DEPOSITS",
  ]);
});
