import { describe, expect, it, vi } from "vitest";
import { AccountType, Unit } from "../../.prisma-client/enums";
import { toMoney } from "../../shared/money";
import { encodeMoneyCache } from "../money-cache-codec";
import type { TransferClearingUnitBucket } from "./transfer-clearing/period-transfer-clearing-types";

vi.mock("../../prisma.server", () => {
  throw new Error("Calculation preparation must not import Prisma.");
});
import { preparePeriodCalculationContext } from "./period-calculation-context";

function bucket(currency: string, balance: string): TransferClearingUnitBucket {
  return {
    unitKey: `currency:${currency}`,
    unitLabel: currency,
    unitType: "currency",
    unit: Unit.CURRENCY,
    currency,
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    isNonReferenceUnit: currency !== "CHF",
    rawBalance: toMoney(balance),
    bookings: [],
  };
}

describe("period calculation preparation", () => {
  it("preserves real balances and combines virtual signs, names, and hierarchy", () => {
    const baseData = {
      baseAssetLiabilityAccounts: [
        {
          id: "cash",
          name: "Cash",
          type: AccountType.ASSET,
          groupId: "group",
          unit: Unit.CURRENCY,
          currency: "CHF",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
          equityAccountSubtype: null,
          assetClass: null,
          isCashAccount: true,
        },
      ],
      endOfPeriodRawBalances: [
        { accountId: "cash", rawBalance: toMoney("123.123456789123456789") },
      ],
      allAccountGroups: [{ id: "group", name: "Assets", parentGroupId: null }],
      transferClearingUnitBuckets: [
        bucket("USD", "-10"),
        bucket("EUR", "20"),
        bucket("GBP", "0"),
        bucket("CHF", "-5"),
      ],
    };
    const before = encodeMoneyCache(baseData);
    const context = preparePeriodCalculationContext(baseData);
    expect(
      context.endOfPeriodRawBalanceByAccountId.get("cash")!.toString(),
    ).toBe("123.123456789123456789");
    expect(
      context.assetLiabilityAccounts.map(({ id, type }) => [id, type]),
    ).toEqual([
      ["cash", AccountType.ASSET],
      ["virtual:transfer-clearing:account:currency:USD", AccountType.ASSET],
      ["virtual:transfer-clearing:account:currency:EUR", AccountType.LIABILITY],
      ["virtual:transfer-clearing:account:currency:CHF", AccountType.ASSET],
    ]);
    expect(
      context.endOfPeriodRawBalanceByAccountId
        .get("virtual:transfer-clearing:account:currency:EUR")!
        .toString(),
    ).toBe("-20");
    expect(
      context.transferClearingHoldingAccounts.map(({ currency }) => currency),
    ).toEqual(["USD", "EUR", "GBP"]);
    expect(
      context.assetLiabilityAccountNameById.get(
        "virtual:transfer-clearing:account:currency:GBP",
      ),
    ).toBe("GBP");
    expect(
      context.groupById.get("virtual:transfer-clearing:currency")
        ?.parentGroupId,
    ).toBe("virtual:transfer-clearing");
    expect(context.allAccountGroups).toEqual(
      Array.from(context.groupById.values()),
    );
    expect(encodeMoneyCache(baseData)).toEqual(before);
    context.assetLiabilityAccountNameById.set("cash", "Changed");
    context.endOfPeriodRawBalanceByAccountId.set("cash", toMoney(0));
    expect(
      preparePeriodCalculationContext(
        baseData,
      ).assetLiabilityAccountNameById.get("cash"),
    ).toBe("Cash");
    expect(baseData.endOfPeriodRawBalances[0]!.rawBalance.toString()).toBe(
      "123.123456789123456789",
    );
  });
  it("prepares an empty book without virtual accounts or groups", () => {
    const context = preparePeriodCalculationContext({
      baseAssetLiabilityAccounts: [],
      endOfPeriodRawBalances: [],
      allAccountGroups: [],
      transferClearingUnitBuckets: [],
    });
    expect(context.assetLiabilityAccounts).toEqual([]);
    expect(context.allAccountGroups).toEqual([]);
    expect(context.transferClearingHoldingAccounts).toEqual([]);
    expect(context.endOfPeriodRawBalanceByAccountId.size).toBe(0);
  });
});
