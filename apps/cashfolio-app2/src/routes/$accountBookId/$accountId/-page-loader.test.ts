import { describe, expect, test } from "vitest";
import { AccountType, EquityAccountSubtype } from "@/.prisma-client/enums";
import { isLedgerPeriodFilterAvailable } from "./-page-loader";

describe("isLedgerPeriodFilterAvailable", () => {
  test("returns true for asset and liability accounts", () => {
    expect(
      isLedgerPeriodFilterAvailable({
        type: AccountType.ASSET,
        equityAccountSubtype: null,
      }),
    ).toBe(true);
    expect(
      isLedgerPeriodFilterAvailable({
        type: AccountType.LIABILITY,
        equityAccountSubtype: null,
      }),
    ).toBe(true);
  });

  test("returns true for non-opening-balance equity accounts", () => {
    expect(
      isLedgerPeriodFilterAvailable({
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.EXPENSE,
      }),
    ).toBe(true);
  });

  test("returns false for opening-balance equity accounts", () => {
    expect(
      isLedgerPeriodFilterAvailable({
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
      }),
    ).toBe(false);
  });
});
