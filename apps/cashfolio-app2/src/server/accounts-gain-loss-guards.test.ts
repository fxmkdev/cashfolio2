import { describe, expect, test } from "vitest";
import { AccountType, EquityAccountSubtype } from "../.prisma-client/enums";
import {
  assertNotSystemManagedGainLossAccount,
  assertNotSystemManagedGainLossGroup,
  isGainLossEquityNode,
} from "./accounts-gain-loss-guards";

describe("accounts-gain-loss-guards", () => {
  test("detects gain/loss equity nodes across entity kinds", () => {
    expect(
      isGainLossEquityNode({
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
      }),
    ).toBe(true);
    expect(
      isGainLossEquityNode({
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
      }),
    ).toBe(false);
  });

  test("throws system-managed errors for gain/loss accounts and groups", () => {
    const gainLossNode = {
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
    } as const;

    expect(() => assertNotSystemManagedGainLossAccount(gainLossNode)).toThrow(
      "Gain/Loss accounts are system-managed.",
    );
    expect(() => assertNotSystemManagedGainLossGroup(gainLossNode)).toThrow(
      "Gain/Loss groups are system-managed.",
    );
  });
});
