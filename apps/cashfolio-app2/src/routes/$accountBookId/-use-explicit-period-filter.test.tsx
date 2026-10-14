import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { useExplicitPeriodFilter } from "./-use-explicit-period-filter";
import { parseLedgerExplicitPeriod } from "./$accountId/-ledger/page-types";
import { clampLedgerExplicitPeriodToBounds } from "./$accountId/-ledger/explicit-period-bounds";
import { parseTransactionsExplicitPeriod } from "./transactions/-page-types";
import { clampTransactionsExplicitPeriodToBounds } from "./transactions/-explicit-period-bounds";

function renderFilter(
  overrides: Partial<Parameters<typeof useExplicitPeriodFilter>[0]> = {},
) {
  let result!: ReturnType<typeof useExplicitPeriodFilter>;
  const onPeriodChange = vi.fn();
  function Harness() {
    result = useExplicitPeriodFilter({
      available: true,
      period: "2026-05",
      locale: "en-CH",
      parsePeriod: parseLedgerExplicitPeriod,
      clampPeriod: clampLedgerExplicitPeriodToBounds,
      clampMinDate: new Date("2026-01-08T00:00:00Z"),
      navigationMinDate: new Date("2026-03-10T00:00:00Z"),
      maxDate: new Date("2026-10-10T00:00:00Z"),
      allowClear: true,
      onPeriodChange,
      ...overrides,
    });
    return null;
  }
  renderToStaticMarkup(createElement(Harness));
  return { ...result, onPeriodChange };
}

describe("explicit period filter configuration and actions", () => {
  test("keeps an empty ledger period selected below its picker minimum", () => {
    const filter = renderFilter({ period: "2026-01" });
    expect(filter.selectedPeriod?.value).toBe("2026-01");
    expect(filter.controls.minMonthPickerDate.getMonth()).toBe(2);
    expect(filter.controls.canGoToPreviousPeriod).toBe(false);
    filter.controls.onPeriodStep(1);
    expect(filter.onPeriodChange.mock.calls).toEqual([["2026-03"]]);
  });

  test("uses Transactions' implicit default without offering clear", () => {
    const filter = renderFilter({
      period: undefined,
      defaultPeriod: "2026-10",
      parsePeriod: parseTransactionsExplicitPeriod,
      clampPeriod: clampTransactionsExplicitPeriodToBounds,
      allowClear: false,
    });
    expect(filter.hasPeriodFilter).toBe(true);
    expect(filter.controls.selectedPeriodLabel).toBe("October 2026");
    expect(filter.controls.canGoToNextPeriod).toBe(false);
    expect(filter.controls.onClearFilter).toBeUndefined();
    expect(filter.onPeriodChange).not.toHaveBeenCalled();
    filter.controls.onPeriodStep(1);
    expect(filter.onPeriodChange).not.toHaveBeenCalled();
  });

  test("unfiltered and unavailable ledgers have no selected period or step navigation", () => {
    for (const options of [{ period: undefined }, { available: false }]) {
      const filter = renderFilter(options);
      expect(filter.hasPeriodFilter).toBe(false);
      expect(filter.controls.selectedPeriodLabel).toBe("All Periods");
      expect(filter.controls.selectedMonthValue).toBeNull();
      expect(filter.controls.canGoToPreviousPeriod).toBe(false);
      expect(filter.controls.canGoToNextPeriod).toBe(false);
      expect(filter.controls.clearFilterDisabled).toBe(true);
      filter.controls.onPeriodStep(-1);
      filter.controls.onPeriodModeChange("year");
      filter.controls.onPeriodModeChange("invalid");
      expect(filter.onPeriodChange).not.toHaveBeenCalled();
    }
  });

  test("changes month/year mode and ignores invalid or unchanged modes", () => {
    const monthly = renderFilter();
    monthly.controls.onPeriodModeChange("month");
    monthly.controls.onPeriodModeChange("invalid");
    monthly.controls.onPeriodModeChange("year");
    expect(monthly.onPeriodChange.mock.calls).toEqual([["2026"]]);
    const yearly = renderFilter({ period: "2026" });
    yearly.controls.onPeriodModeChange("month");
    yearly.controls.onPeriodStep(-1);
    expect(yearly.onPeriodChange.mock.calls).toEqual([["2026-10"]]);
  });

  test("commits valid picker values, clears, and exposes the setter to page actions", () => {
    const filter = renderFilter();
    filter.controls.onMonthPickerChange(null);
    filter.controls.onMonthPickerChange("invalid");
    filter.controls.onYearPickerChange(null);
    filter.controls.onYearPickerChange("invalid");
    filter.controls.onMonthPickerChange("2026-04-01");
    filter.controls.onYearPickerChange("2026-01-01");
    filter.controls.onClearFilter?.();
    filter.setPeriodFilter("2026-08");
    expect(filter.onPeriodChange.mock.calls).toEqual([
      ["2026-04"],
      ["2026"],
      [undefined],
      ["2026-08"],
    ]);
  });

  test("uses the configured locale for labels", () => {
    const filter = renderFilter({ locale: "de-CH" });
    expect(filter.controls.selectedPeriodLabel).toBe("Mai 2026");
  });
});
