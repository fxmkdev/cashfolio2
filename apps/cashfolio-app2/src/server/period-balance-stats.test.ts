import { describe, expect, test, vi } from "vitest";
import { moneyMultiply, toMoney, type Money } from "../shared/money";
import { toNumericMoney } from "./money-boundary";
import {
  AccountType,
  Unit,
  computeEndOfPeriodBalanceStats,
} from "./period.test-support";

describe("computeEndOfPeriodBalanceStats", () => {
  test("computes net worth as assets minus liabilities", async () => {
    const periodEnd = new Date("2026-02-28T00:00:00.000Z");
    const result = await computeEndOfPeriodBalanceStats({
      accounts: [
        {
          id: "asset-chf",
          type: AccountType.BALANCE,
          unit: Unit.CURRENCY,
          currency: "CHF",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
        },
        {
          id: "liability-usd",
          type: AccountType.BALANCE,
          unit: Unit.CURRENCY,
          currency: "USD",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
        },
      ],
      rawBalanceByAccountId: new Map([
        ["asset-chf", toMoney(100)],
        ["liability-usd", toMoney(-40)],
      ]),
      periodEnd,
      referenceCurrency: "CHF",
      convertBalanceToReference: async (input) => {
        if (input.currency === "USD") {
          return moneyMultiply(input.value, 2);
        }
        return input.value;
      },
    });

    expect(toNumericMoney(result)).toEqual({
      assets: 100,
      liabilities: 80,
      netWorth: 20,
      skippedCount: 0,
    });
  });

  test("counts skipped conversions for missing unit metadata and null conversions", async () => {
    const periodEnd = new Date("2026-02-28T00:00:00.000Z");
    const convertBalanceToReference = vi.fn(
      async (input: { value: Money; symbol: string | null; date: Date }) => {
        if (input.symbol === "NO_RATE") {
          return null;
        }
        return input.value;
      },
    );

    const result = await computeEndOfPeriodBalanceStats({
      accounts: [
        {
          id: "asset-ok",
          type: AccountType.BALANCE,
          unit: Unit.CURRENCY,
          currency: "CHF",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
        },
        {
          id: "liability-ok",
          type: AccountType.BALANCE,
          unit: Unit.CURRENCY,
          currency: "CHF",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
        },
        {
          id: "asset-missing-unit",
          type: AccountType.BALANCE,
          unit: null,
          currency: null,
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
        },
        {
          id: "asset-no-rate",
          type: AccountType.BALANCE,
          unit: Unit.SECURITY,
          currency: null,
          cryptocurrency: null,
          symbol: "NO_RATE",
          tradeCurrency: "USD",
        },
      ],
      rawBalanceByAccountId: new Map([
        ["asset-ok", toMoney(50)],
        ["liability-ok", toMoney(-10)],
        ["asset-missing-unit", toMoney(20)],
        ["asset-no-rate", toMoney(5)],
      ]),
      periodEnd,
      referenceCurrency: "CHF",
      convertBalanceToReference,
    });

    expect(toNumericMoney(result)).toEqual({
      assets: 50,
      liabilities: 10,
      netWorth: 40,
      skippedCount: 2,
    });
    expect(convertBalanceToReference).toHaveBeenCalledTimes(3);
    expect(convertBalanceToReference).toHaveBeenCalledWith(
      expect.objectContaining({
        date: periodEnd,
      }),
    );
  });

  test("does not count missing-unit accounts without raw balance as skipped", async () => {
    const periodEnd = new Date("2026-02-28T00:00:00.000Z");
    const convertBalanceToReference = vi.fn(
      async (input: { value: Money }) => input.value,
    );

    const result = await computeEndOfPeriodBalanceStats({
      accounts: [
        {
          id: "asset-missing-unit-no-balance",
          type: AccountType.BALANCE,
          unit: null,
          currency: null,
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
        },
      ],
      rawBalanceByAccountId: new Map(),
      periodEnd,
      referenceCurrency: "CHF",
      convertBalanceToReference,
    });

    expect(toNumericMoney(result)).toEqual({
      assets: 0,
      liabilities: 0,
      netWorth: 0,
      skippedCount: 0,
    });
    expect(convertBalanceToReference).not.toHaveBeenCalled();
  });

  test("does not count missing-unit accounts with zero net raw balance as skipped", async () => {
    const periodEnd = new Date("2026-02-28T00:00:00.000Z");
    const convertBalanceToReference = vi.fn(
      async (input: { value: Money }) => input.value,
    );

    const result = await computeEndOfPeriodBalanceStats({
      accounts: [
        {
          id: "asset-missing-unit-zero-net",
          type: AccountType.BALANCE,
          unit: null,
          currency: null,
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
        },
      ],
      rawBalanceByAccountId: new Map([
        ["asset-missing-unit-zero-net", toMoney(0)],
      ]),
      periodEnd,
      referenceCurrency: "CHF",
      convertBalanceToReference,
    });

    expect(toNumericMoney(result)).toEqual({
      assets: 0,
      liabilities: 0,
      netWorth: 0,
      skippedCount: 0,
    });
    expect(convertBalanceToReference).not.toHaveBeenCalled();
  });
});
