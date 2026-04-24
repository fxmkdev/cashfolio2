import { beforeEach, describe, expect, test, vi } from "vitest";
import { AccountType, EquityAccountSubtype } from "../.prisma-client/enums";
import { GAIN_LOSS_SIMPLE_TRANSACTION_INVARIANT_MESSAGE } from "../shared/gain-loss-transaction-invariant";

const prisma = vi.hoisted(() => ({
  booking: {
    findMany: vi.fn(),
  },
}));

vi.mock("../prisma.server", () => ({
  prisma,
}));

import { validateRebookGainLossSimpleTransactionInvariant } from "./rebook-gain-loss-validation";

describe("validateRebookGainLossSimpleTransactionInvariant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("allows resulting gain/loss + asset composition", async () => {
    prisma.booking.findMany.mockResolvedValueOnce([
      {
        id: "booking-1",
        account: {
          type: AccountType.LIABILITY,
          equityAccountSubtype: null,
        },
      },
      {
        id: "booking-2",
        account: {
          type: AccountType.EQUITY,
          equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
        },
      },
    ]);

    await expect(
      validateRebookGainLossSimpleTransactionInvariant({
        accountBookId: "book-1",
        transactionId: "tx-1",
        bookingId: "booking-1",
        targetAccount: {
          type: AccountType.ASSET,
          equityAccountSubtype: null,
        },
      }),
    ).resolves.toBeUndefined();
  });

  test("rejects resulting gain/loss + income composition", async () => {
    prisma.booking.findMany.mockResolvedValueOnce([
      {
        id: "booking-1",
        account: {
          type: AccountType.ASSET,
          equityAccountSubtype: null,
        },
      },
      {
        id: "booking-2",
        account: {
          type: AccountType.EQUITY,
          equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
        },
      },
    ]);

    await expect(
      validateRebookGainLossSimpleTransactionInvariant({
        accountBookId: "book-1",
        transactionId: "tx-1",
        bookingId: "booking-1",
        targetAccount: {
          type: AccountType.EQUITY,
          equityAccountSubtype: EquityAccountSubtype.INCOME,
        },
      }),
    ).rejects.toThrow(GAIN_LOSS_SIMPLE_TRANSACTION_INVARIANT_MESSAGE);
  });
});
