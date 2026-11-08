import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
import { OPENING_BALANCES_MANAGEMENT_MESSAGE } from "../../shared/accounts/opening-balances";
import {
  cleanupTransactionMutation,
  createAssetAccount,
  createCounterEquityAccount,
  createSimpleInput,
  createSimpleTransaction,
  invalidatePeriodBaseDataCacheForAccountBook,
  prisma,
  resetTransactionMutation,
} from "./transactions-mutations.test-support";

describe("transactions mutations", () => {
  beforeEach(resetTransactionMutation);
  afterEach(cleanupTransactionMutation);

  it("rejects simple transactions with invalid amount", async () => {
    await expect(
      createSimpleTransaction({
        data: createSimpleInput({ amount: 0 }),
      }),
    ).rejects.toThrow("Amount must be greater than zero.");
  });

  it("rejects simple transactions that reuse the same account", async () => {
    await expect(
      createSimpleTransaction({
        data: createSimpleInput({ counterAccountId: "asset-1" }),
      }),
    ).rejects.toThrow(
      "Counter account must be different from the current account.",
    );
  });

  it("rejects simple transactions with non-canonical time-bearing dates", async () => {
    await expect(
      createSimpleTransaction({
        data: createSimpleInput({ date: "2026-01-11T23:00:00.000Z" }),
      }),
    ).rejects.toThrow("Date must be a valid UTC day.");

    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it("rejects missing current account in simple transactions", async () => {
    prisma.account.findMany.mockResolvedValueOnce([
      createCounterEquityAccount(),
    ]);

    await expect(
      createSimpleTransaction({
        data: createSimpleInput(),
      }),
    ).rejects.toThrow("Current account was not found.");
  });

  it("rejects inactive counter account for simple transactions", async () => {
    prisma.account.findMany.mockResolvedValueOnce([
      createAssetAccount("asset-1"),
      {
        ...createCounterEquityAccount(),
        isActive: false,
      },
    ]);

    await expect(
      createSimpleTransaction({
        data: createSimpleInput(),
      }),
    ).rejects.toThrow("Counter account must be active.");
  });

  it("rejects unit mismatches between current and counter asset/liability accounts", async () => {
    prisma.account.findMany.mockResolvedValueOnce([
      createAssetAccount("asset-1"),
      {
        id: "counter-1",
        type: AccountType.BALANCE,
        equityAccountSubtype: null,
        unit: Unit.CURRENCY,
        currency: "USD",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        isActive: true,
      },
    ]);

    await expect(
      createSimpleTransaction({
        data: createSimpleInput(),
      }),
    ).rejects.toThrow(
      "Asset and liability accounts must use the same unit as the current account.",
    );
  });

  it("rejects opening-balance accounts as simple-transaction targets", async () => {
    prisma.account.findMany.mockResolvedValueOnce([
      createAssetAccount("asset-1"),
      createCounterEquityAccount(EquityAccountSubtype.OPENING_BALANCES),
    ]);

    await expect(
      createSimpleTransaction({
        data: createSimpleInput(),
      }),
    ).rejects.toThrow(OPENING_BALANCES_MANAGEMENT_MESSAGE);
  });

  it("rejects simple transactions before account-book start date", async () => {
    prisma.accountBook.findUniqueOrThrow.mockResolvedValueOnce({
      startDate: new Date("2026-01-20T00:00:00.000Z"),
    });

    await expect(
      createSimpleTransaction({
        data: createSimpleInput({ date: "2026-01-12T00:00:00.000Z" }),
      }),
    ).rejects.toThrow(
      "Date cannot be before account book start date (2026-01-20).",
    );
  });

  it("creates a simple transaction when inputs are valid", async () => {
    const created = { id: "tx-simple" };
    prisma.transaction.create.mockResolvedValueOnce(created);

    await expect(
      createSimpleTransaction({
        data: createSimpleInput(),
      }),
    ).resolves.toEqual(created);

    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountBookId: "book-1",
          description: "Simple transfer",
        }),
      }),
    );
    expect(invalidatePeriodBaseDataCacheForAccountBook).toHaveBeenCalledWith(
      "book-1",
    );
  });

  it("creates a simple transaction with a future date", async () => {
    const created = { id: "tx-future-simple" };
    prisma.transaction.create.mockResolvedValueOnce(created);

    await expect(
      createSimpleTransaction({
        data: createSimpleInput({ date: "2026-03-12T00:00:00.000Z" }),
      }),
    ).resolves.toEqual(created);

    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bookings: expect.objectContaining({
            create: expect.arrayContaining([
              expect.objectContaining({
                date: new Date("2026-03-12T00:00:00.000Z"),
              }),
            ]),
          }),
        }),
      }),
    );
  });
});
