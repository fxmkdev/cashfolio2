import { describe, expect, test } from "vitest";
import { toNumericMoney } from "./money-boundary";
import {
  Unit,
  isMultiUnitTransaction,
  shouldIncludeTransactionForPeriod,
} from "./period.test-support";

describe("transaction period inclusion", () => {
  const periodStart = new Date("2026-02-01T00:00:00.000Z");

  const periodEndExclusive = new Date("2026-03-01T00:00:00.000Z");

  test("includes transactions when at least one booking is in period and none after end", () => {
    expect(
      toNumericMoney(
        shouldIncludeTransactionForPeriod({
          bookingDates: [
            new Date("2026-01-25T00:00:00.000Z"),
            new Date("2026-02-14T00:00:00.000Z"),
          ],
          periodStart,
          periodEndExclusive,
        }),
      ),
    ).toBe(true);
  });

  test("excludes transactions when latest booking is on/after period end", () => {
    expect(
      toNumericMoney(
        shouldIncludeTransactionForPeriod({
          bookingDates: [
            new Date("2026-02-14T00:00:00.000Z"),
            new Date("2026-03-01T00:00:00.000Z"),
          ],
          periodStart,
          periodEndExclusive,
        }),
      ),
    ).toBe(false);
  });

  test("excludes transactions without any booking in period", () => {
    expect(
      toNumericMoney(
        shouldIncludeTransactionForPeriod({
          bookingDates: [
            new Date("2026-01-14T00:00:00.000Z"),
            new Date("2026-01-20T00:00:00.000Z"),
          ],
          periodStart,
          periodEndExclusive,
        }),
      ),
    ).toBe(false);
  });

  test("detects multi-unit transactions", () => {
    expect(
      toNumericMoney(
        isMultiUnitTransaction([
          {
            unit: Unit.CURRENCY,
            currency: "CHF",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
          },
          {
            unit: Unit.CURRENCY,
            currency: "EUR",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
          },
        ]),
      ),
    ).toBe(true);

    expect(
      toNumericMoney(
        isMultiUnitTransaction([
          {
            unit: Unit.CURRENCY,
            currency: "CHF",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
          },
          {
            unit: Unit.CURRENCY,
            currency: "CHF",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
          },
        ]),
      ),
    ).toBe(false);

    expect(
      toNumericMoney(
        isMultiUnitTransaction([
          {
            unit: Unit.SECURITY,
            currency: null,
            cryptocurrency: null,
            symbol: "AAPL",
            tradeCurrency: "USD",
          },
          {
            unit: Unit.SECURITY,
            currency: null,
            cryptocurrency: null,
            symbol: "AAPL",
            tradeCurrency: "CHF",
          },
        ]),
      ),
    ).toBe(true);
  });
});
