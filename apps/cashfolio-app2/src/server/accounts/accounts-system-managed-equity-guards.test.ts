import { describe, expect, test } from "vitest";
import { AccountType, EquityAccountSubtype } from "../../.prisma-client/enums";
import {
  assertNoSystemManagedAccountSubtype,
  assertNoSystemManagedGroupSubtype,
  isSystemManagedEquityNode,
} from "./accounts-system-managed-equity-guards";

describe("accounts-system-managed-equity-guards", () => {
  test("detects system-managed equity nodes across entity kinds", () => {
    expect(
      isSystemManagedEquityNode({
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
      }),
    ).toBe(true);
    expect(
      isSystemManagedEquityNode({
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
      }),
    ).toBe(true);
    expect(
      isSystemManagedEquityNode({
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.INCOME,
      }),
    ).toBe(false);
  });

  test("throws system-managed errors for gain/loss accounts and groups", () => {
    const gainLossNode = {
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
    } as const;

    expect(() => assertNoSystemManagedAccountSubtype(gainLossNode)).toThrow(
      "Gain/Loss accounts are system-managed.",
    );
    expect(() => assertNoSystemManagedGroupSubtype(gainLossNode)).toThrow(
      "Gain/Loss groups are system-managed.",
    );
  });

  test("throws system-managed errors for opening balances accounts and groups", () => {
    const openingBalancesNode = {
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
    } as const;

    expect(() =>
      assertNoSystemManagedAccountSubtype(openingBalancesNode),
    ).toThrow("Opening Balances accounts are system-managed.");
    expect(() =>
      assertNoSystemManagedGroupSubtype(openingBalancesNode),
    ).toThrow("Opening Balances groups are system-managed.");
  });

  test("rejects system-managed subtype even when type is not equity", () => {
    const inconsistentNode = {
      type: AccountType.ASSET,
      equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
    } as const;

    expect(() => assertNoSystemManagedAccountSubtype(inconsistentNode)).toThrow(
      "Gain/Loss accounts are system-managed.",
    );
  });
});
