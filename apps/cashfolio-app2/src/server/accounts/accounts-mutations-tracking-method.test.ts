import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccountTrackingMethod,
  AccountType,
  Unit,
} from "../../.prisma-client/enums";
import {
  ensureAuthorizedForAccountBookId,
  ensureSameOriginRequestFromServerContext,
  invalidatePeriodBaseDataCacheForAccountBook,
  prisma,
  setAccountsTrackingMethod,
  tx,
} from "./accounts-mutations.test-support";

describe("setAccountsTrackingMethod", () => {
  const input = {
    accountBookId: "book-1",
    accountIds: ["active", "archived"],
    trackingMethod: AccountTrackingMethod.TOTAL_PORTFOLIO_VALUE,
  };

  const accounts = input.accountIds.map((id) => ({
    id,
    type: AccountType.BALANCE,
    unit: Unit.CURRENCY,
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    ensureAuthorizedForAccountBookId.mockReset().mockResolvedValue(undefined);
    ensureSameOriginRequestFromServerContext.mockReset();
    prisma.$transaction
      .mockReset()
      .mockImplementation(async (callback) => callback(tx));
    tx.$queryRaw.mockResolvedValue([{ id: "book-1" }]);
    tx.account.findMany.mockResolvedValue(accounts);
    tx.account.updateMany.mockReset().mockResolvedValue({ count: 2 });
  });

  it.each(Object.values(AccountTrackingMethod))(
    "sets %s on active and archived currency accounts without rewriting bookings",
    async (trackingMethod) => {
      await expect(
        setAccountsTrackingMethod({ data: { ...input, trackingMethod } }),
      ).resolves.toEqual({ count: 2 });
      expect(ensureSameOriginRequestFromServerContext).toHaveBeenCalledOnce();
      expect(ensureAuthorizedForAccountBookId).toHaveBeenCalledWith("book-1");
      expect(tx.$queryRaw).toHaveBeenCalledOnce();
      expect(tx.account.findMany).toHaveBeenCalledWith({
        where: { accountBookId: "book-1", id: { in: input.accountIds } },
        select: { id: true, type: true, unit: true },
      });
      expect(tx.account.updateMany).toHaveBeenCalledExactlyOnceWith({
        where: { accountBookId: "book-1", id: { in: input.accountIds } },
        data: { trackingMethod },
      });
      expect(tx.booking.deleteMany).not.toHaveBeenCalled();
      expect(tx.transaction.create).not.toHaveBeenCalled();
      expect(tx.transaction.update).not.toHaveBeenCalled();
      expect(tx.account.update).not.toHaveBeenCalled();
      expect(
        invalidatePeriodBaseDataCacheForAccountBook,
      ).toHaveBeenCalledExactlyOnceWith("book-1");
    },
  );

  it("deduplicates IDs before checking the complete target set", async () => {
    await setAccountsTrackingMethod({
      data: { ...input, accountIds: ["active", "archived", "active"] },
    });
    expect(tx.account.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountBookId: "book-1", id: { in: input.accountIds } },
      }),
    );
  });

  it.each([
    ["missing or foreign-book account", accounts.slice(0, 1)],
    ["category", [accounts[0], { ...accounts[1], type: AccountType.EQUITY }]],
    ["security", [accounts[0], { ...accounts[1], unit: Unit.SECURITY }]],
    [
      "cryptocurrency",
      [accounts[0], { ...accounts[1], unit: Unit.CRYPTOCURRENCY }],
    ],
    ["missing unit", [accounts[0], { ...accounts[1], unit: null }]],
  ])("rejects the entire selection for a %s", async (_, targets) => {
    tx.account.findMany.mockResolvedValue(targets);
    await expect(setAccountsTrackingMethod({ data: input })).rejects.toThrow(
      "no longer available as currency accounts",
    );
    expect(tx.account.updateMany).not.toHaveBeenCalled();
    expect(invalidatePeriodBaseDataCacheForAccountBook).not.toHaveBeenCalled();
  });

  it("does not read or write accounts when authorization fails", async () => {
    ensureAuthorizedForAccountBookId.mockRejectedValueOnce(
      new Error("Forbidden"),
    );
    await expect(setAccountsTrackingMethod({ data: input })).rejects.toThrow(
      "Forbidden",
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.account.findMany).not.toHaveBeenCalled();
    expect(tx.account.updateMany).not.toHaveBeenCalled();
  });

  it("does not invalidate caches after a failed transaction", async () => {
    tx.account.updateMany.mockRejectedValueOnce(new Error("Write failed"));
    await expect(setAccountsTrackingMethod({ data: input })).rejects.toThrow(
      "Write failed",
    );
    expect(invalidatePeriodBaseDataCacheForAccountBook).not.toHaveBeenCalled();
  });

  it.each([
    { accountIds: [] },
    { accountIds: [""] },
    { accountIds: [1] },
    { accountIds: "active" },
    { accountBookId: "" },
    { trackingMethod: undefined },
    { trackingMethod: null },
    { trackingMethod: "" },
    { trackingMethod: "PORTFOLIO" },
    { trackingMethod: 1 },
  ])(
    "rejects malformed input %j before opening a transaction",
    async (override) => {
      await expect(
        setAccountsTrackingMethod({ data: { ...input, ...override } }),
      ).rejects.toThrow();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
});
