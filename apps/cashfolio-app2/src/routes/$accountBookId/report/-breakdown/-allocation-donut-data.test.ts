import { describe, expect, test } from "vitest";
import {
  simplifyAllocationDonut,
  ALLOCATION_OTHER_ID,
} from "./-allocation-donut-data";
import type { PeriodBreakdownChartDatum } from "./-breakdown-chart-options";

const currency = new Intl.NumberFormat("de-CH", {
  style: "currency",
  currency: "CHF",
});
const percent = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 1 });
function makeData(amounts: number[]): PeriodBreakdownChartDatum[] {
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  return amounts.map((amount, index) => ({
    id: `account:${index}`,
    label: "Same Name",
    kind: "account",
    amount,
    percentage: total ? (amount / total) * 100 : 0,
    isDrillable: false,
    amountLabel: currency.format(amount),
    percentageLabel: "",
  }));
}

describe("Allocation donut simplification", () => {
  test.each([0, 1, 5])("keeps all %i categories without Other", (count) => {
    const data = makeData(Array.from({ length: count }, (_, i) => i + 1));
    const result = simplifyAllocationDonut(data, currency, percent);
    expect(result.otherRows).toEqual([]);
    expect(result.chartData).toEqual([...data].reverse());
    expect(result.chartData.some((row) => row.kind === "other")).toBe(false);
  });

  test("combines the remainder at six categories and preserves full totals and IDs", () => {
    const data = makeData([10.11, 30.33, 50.55, 20.22, 60.66, 40.44]);
    const original = structuredClone(data);
    const { chartData, otherRows } = simplifyAllocationDonut(
      data,
      currency,
      percent,
    );
    expect(chartData).toHaveLength(5);
    expect(chartData.slice(0, 4).map((row) => row.id)).toEqual([
      "account:4",
      "account:2",
      "account:5",
      "account:1",
    ]);
    expect(otherRows.map((row) => row.id)).toEqual(["account:3", "account:0"]);
    const other = chartData.at(-1)!;
    expect(other).toMatchObject({
      id: ALLOCATION_OTHER_ID,
      kind: "other",
      label: "Other",
      isDrillable: false,
    });
    expect(other.amount).toBeCloseTo(30.33);
    expect(other.amountLabel).toBe(currency.format(other.amount));
    expect(other.percentageLabel).toBe(`${percent.format(other.percentage)}%`);
    expect(chartData.reduce((sum, row) => sum + row.amount, 0)).toBeCloseTo(
      data.reduce((sum, row) => sum + row.amount, 0),
    );
    expect(chartData.reduce((sum, row) => sum + row.percentage, 0)).toBeCloseTo(
      100,
    );
    expect(data).toEqual(original);
  });

  test("ties retain source order and Other remains last even when it is largest", () => {
    const data = makeData(Array<number>(10).fill(1));
    const { chartData, otherRows } = simplifyAllocationDonut(
      data,
      currency,
      percent,
    );
    expect(chartData.slice(0, 4)).toEqual(data.slice(0, 4));
    expect(chartData.at(-1)?.amount).toBe(6);
    expect(otherRows).toEqual(data.slice(4));
    expect(otherRows[0].percentage).toBe(10);
  });

  test("retains original share denominator when displayed children differ from the parent total", () => {
    const data = makeData([6, 5, 4, 3, 2, 1]).map((row) => ({
      ...row,
      percentage: (row.amount / 22) * 100,
    }));
    const { chartData, otherRows } = simplifyAllocationDonut(
      data,
      currency,
      percent,
    );
    expect(chartData.at(-1)?.percentage).toBeCloseTo((3 / 22) * 100);
    expect(otherRows.map((row) => row.percentage)).toEqual([
      (2 / 22) * 100,
      (1 / 22) * 100,
    ]);
  });
});
