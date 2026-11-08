import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountType } from "../../.prisma-client/enums";
import { defaultAssetClassIds } from "../../shared/classification/asset-class";
import {
  ensureAuthorizedForAccountBookId,
  ensureSameOriginRequestFromServerContext,
  invalidatePeriodBaseDataCacheForAccountBook,
  prisma,
  setAccountsAssetClass,
  tx,
} from "./accounts-mutations.test-support";

describe("setAccountsAssetClass", () => {
  const input = {
    accountBookId: "book-1",
    accountIds: ["active", "archived"],
    assetClassId: defaultAssetClassIds.EQUITIES,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    tx.classificationNode.findUnique.mockResolvedValue({ id: "class" });
    tx.accountClassification.deleteMany.mockResolvedValue({ count: 0 });
    tx.accountClassification.createMany.mockResolvedValue({ count: 1 });
    ensureAuthorizedForAccountBookId.mockReset().mockResolvedValue(undefined);
    ensureSameOriginRequestFromServerContext.mockReset();
    prisma.$transaction
      .mockReset()
      .mockImplementation(async (callback) => callback(tx));
    tx.$queryRaw.mockResolvedValue([{ id: "book-1" }]);
    tx.account.findMany.mockResolvedValue([
      { id: "active", type: AccountType.BALANCE },
      { id: "archived", type: AccountType.BALANCE },
    ]);
    tx.account.updateMany.mockResolvedValue({ count: 2 });
  });

  it.each([...Object.values(defaultAssetClassIds), null])(
    "sets %s on active and archived accounts in one book mutation",
    async (assetClassId) => {
      await expect(
        setAccountsAssetClass({ data: { ...input, assetClassId } }),
      ).resolves.toEqual({ count: 2 });
      expect(ensureSameOriginRequestFromServerContext).toHaveBeenCalledOnce();
      expect(ensureAuthorizedForAccountBookId).toHaveBeenCalledWith("book-1");
      expect(tx.$queryRaw).toHaveBeenCalledOnce();
      expect(tx.account.findMany).toHaveBeenCalledWith({
        where: { accountBookId: "book-1", id: { in: input.accountIds } },
        select: { id: true, type: true },
      });
      expect(
        tx.accountClassification.deleteMany,
      ).toHaveBeenCalledExactlyOnceWith({
        where: {
          accountBookId: "book-1",
          schemeId: "assetClass",
          accountId: { in: input.accountIds },
        },
      });
      if (assetClassId)
        expect(tx.accountClassification.createMany).toHaveBeenCalledWith({
          data: input.accountIds.map((accountId) => ({
            accountId,
            accountBookId: "book-1",
            schemeId: "assetClass",
            nodeId: assetClassId,
          })),
        });
      else expect(tx.accountClassification.createMany).not.toHaveBeenCalled();
      expect(
        invalidatePeriodBaseDataCacheForAccountBook,
      ).toHaveBeenCalledExactlyOnceWith("book-1");
    },
  );

  it("deduplicates account IDs before checking the complete target set", async () => {
    await setAccountsAssetClass({
      data: { ...input, accountIds: ["active", "archived", "active"] },
    });
    expect(tx.accountClassification.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ accountId: { in: input.accountIds } }),
      }),
    );
  });

  it.each([
    [
      "missing or foreign-book account",
      [{ id: "active", type: AccountType.BALANCE }],
    ],
    [
      "category",
      [
        { id: "active", type: AccountType.BALANCE },
        { id: "archived", type: AccountType.EQUITY },
      ],
    ],
  ])("rejects the entire selection for a %s", async (_, accounts) => {
    tx.account.findMany.mockResolvedValue(accounts);
    await expect(setAccountsAssetClass({ data: input })).rejects.toThrow(
      "no longer available",
    );
    expect(tx.account.updateMany).not.toHaveBeenCalled();
    expect(invalidatePeriodBaseDataCacheForAccountBook).not.toHaveBeenCalled();
  });

  it("does not read or write accounts when authorization fails", async () => {
    ensureAuthorizedForAccountBookId.mockRejectedValueOnce(
      new Error("Forbidden"),
    );
    await expect(setAccountsAssetClass({ data: input })).rejects.toThrow(
      "Forbidden",
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.account.updateMany).not.toHaveBeenCalled();
  });

  it("does not invalidate caches after a failed transaction", async () => {
    tx.accountClassification.deleteMany.mockRejectedValueOnce(
      new Error("Write failed"),
    );
    await expect(setAccountsAssetClass({ data: input })).rejects.toThrow(
      "Write failed",
    );
    expect(invalidatePeriodBaseDataCacheForAccountBook).not.toHaveBeenCalled();
  });

  it.each([
    { accountIds: [] },
    { accountIds: [""] },
    { accountIds: [1] },
    { accountIds: "active" },
    { assetClassId: undefined },
    { assetClassId: "" },
    { assetClassId: 1 },
    { accountBookId: "" },
  ])(
    "rejects malformed input %j before opening a transaction",
    async (override) => {
      await expect(
        setAccountsAssetClass({ data: { ...input, ...override } }),
      ).rejects.toThrow();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
});
