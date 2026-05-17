import { describe, expect, it } from "vitest";
import type { ValuationCacheUnitsResponse } from "@/server/valuation-cache";
import {
  getRowsForValuationUnitTab,
  resolveSelectedUnit,
  toValuationCacheSeriesInput,
  updateSelectedUnitKeyByTab,
} from "./-page-data";

const units: ValuationCacheUnitsResponse = {
  currencyUnits: [
    {
      unitType: "CURRENCY",
      label: "EUR",
      unitKey: "currency:EUR",
      currency: "EUR",
    },
  ],
  cryptocurrencyUnits: [
    {
      unitType: "CRYPTOCURRENCY",
      label: "BTC",
      unitKey: "crypto:BTC",
      cryptocurrency: "BTC",
    },
  ],
  securityUnits: [
    {
      unitType: "SECURITY",
      label: "AAPL (USD)",
      unitKey: "security:AAPL:USD",
      symbol: "AAPL",
      tradeCurrency: "USD",
    },
    {
      unitType: "SECURITY",
      label: "MSFT (USD)",
      unitKey: "security:MSFT:USD",
      symbol: "MSFT",
      tradeCurrency: "USD",
    },
  ],
};

describe("valuation-cache page data helpers", () => {
  it("returns row data for the active tab", () => {
    expect(getRowsForValuationUnitTab({ units, tab: "CURRENCY" })).toEqual(
      units.currencyUnits,
    );
    expect(
      getRowsForValuationUnitTab({ units, tab: "CRYPTOCURRENCY" }),
    ).toEqual(units.cryptocurrencyUnits);
    expect(getRowsForValuationUnitTab({ units, tab: "SECURITY" })).toEqual(
      units.securityUnits,
    );
  });

  it("resolves selected row from remembered selection or defaults to first row", () => {
    const rows = units.securityUnits;

    expect(
      resolveSelectedUnit({
        rows,
        selectedUnitKeyByTab: { SECURITY: "security:MSFT:USD" },
        tab: "SECURITY",
      }),
    ).toEqual(rows[1]);

    expect(
      resolveSelectedUnit({
        rows,
        selectedUnitKeyByTab: { SECURITY: "security:NOT_FOUND" },
        tab: "SECURITY",
      }),
    ).toEqual(rows[0]);

    expect(
      resolveSelectedUnit({
        rows: [],
        selectedUnitKeyByTab: {},
        tab: "SECURITY",
      }),
    ).toBeNull();
  });

  it("updates remembered row selection by tab", () => {
    const next = updateSelectedUnitKeyByTab({
      selectedUnitKeyByTab: { CURRENCY: "currency:EUR" },
      tab: "SECURITY",
      unitKey: "security:AAPL:USD",
    });

    expect(next).toEqual({
      CURRENCY: "currency:EUR",
      SECURITY: "security:AAPL:USD",
    });

    const unchanged = updateSelectedUnitKeyByTab({
      selectedUnitKeyByTab: next,
      tab: "SECURITY",
      unitKey: "security:AAPL:USD",
    });

    expect(unchanged).toBe(next);
  });

  it("creates chart-series request payload from selected row", () => {
    expect(
      toValuationCacheSeriesInput({
        unit: units.currencyUnits[0],
      }),
    ).toEqual({
      unitType: "CURRENCY",
      currency: "EUR",
      cryptocurrency: undefined,
      symbol: undefined,
      tradeCurrency: undefined,
    });

    expect(
      toValuationCacheSeriesInput({
        unit: units.securityUnits[0],
      }),
    ).toEqual({
      unitType: "SECURITY",
      currency: undefined,
      cryptocurrency: undefined,
      symbol: "AAPL",
      tradeCurrency: "USD",
    });
  });
});
