import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  authorize: vi.fn(),
  invalidate: vi.fn(),
  lock: vi.fn(),
  tx: {
    classificationNode: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    accountClassification: { deleteMany: vi.fn(), createMany: vi.fn() },
  },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (data: unknown) => unknown;
    const chain = {
      validator: (fn: typeof validate) => {
        validate = fn;
        return chain;
      },
      handler:
        (fn: (args: { data: unknown }) => unknown) =>
        (args: { data: unknown }) =>
          fn({ data: validate(args.data) }),
    };
    return chain;
  },
}));
vi.mock("../prisma.server", () => ({ prisma: mocks.tx }));
vi.mock("../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId: mocks.authorize,
}));
vi.mock("./mutation-guard.server", () => ({
  ensureAuthorizedAccountBookMutation: mocks.guard,
}));
vi.mock("./account-book-mutation.server", () => ({
  withAccountBookMutation: mocks.lock,
}));
vi.mock("./database-conflict-retry", () => ({
  withDatabaseConflictRetry: (fn: () => unknown) => fn(),
}));
vi.mock("./period/cache/period-base-data-cache", () => ({
  invalidatePeriodBaseDataCacheForAccountBook: mocks.invalidate,
}));
import {
  getAssetClasses,
  saveAssetClass,
  moveAssetClass,
  deleteAssetClass,
} from "./classifications";
const nodes = [
  { id: "equities", name: "Equities", parentId: null, sortOrder: 0 },
  { id: "cash", name: "Cash", parentId: null, sortOrder: 1 },
];
beforeEach(() => {
  vi.resetAllMocks();
  mocks.lock.mockImplementation(async (_book, fn) => fn(mocks.tx));
  mocks.tx.classificationNode.findMany.mockResolvedValue(nodes);
  mocks.tx.classificationNode.findUnique.mockResolvedValue(nodes[0]);
});
describe("classification endpoints", () => {
  it("authorizes reads and returns active/archived assignment counts", async () => {
    mocks.tx.classificationNode.findMany.mockResolvedValue([
      {
        ...nodes[0],
        assignments: [
          { account: { isActive: true } },
          { account: { isActive: false } },
        ],
      },
    ]);
    await expect(
      getAssetClasses({ data: { accountBookId: "book" } }),
    ).resolves.toEqual([{ ...nodes[0], activeCount: 1, archivedCount: 1 }]);
    expect(mocks.authorize).toHaveBeenCalledWith("book");
    expect(mocks.tx.classificationNode.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountBookId: "book", schemeId: "assetClass" },
      }),
    );
  });
  it("creates a child and invalidates only after the serialized write succeeds", async () => {
    await saveAssetClass({
      data: { accountBookId: "book", name: "  Swiss  ", parentId: "equities" },
    });
    expect(mocks.guard).toHaveBeenCalledWith("book");
    expect(mocks.lock).toHaveBeenCalledWith("book", expect.any(Function));
    expect(mocks.tx.classificationNode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: expect.any(String),
        name: "Swiss",
        parentId: "equities",
        schemeId: "assetClass",
        accountBookId: "book",
        sortOrder: 0,
      }),
    });
    expect(mocks.invalidate).toHaveBeenCalledWith("book");
  });
  it("renames/reparents an existing class without replacing its ID", async () => {
    await saveAssetClass({
      data: {
        accountBookId: "book",
        id: "cash",
        name: "Cash Holdings",
        parentId: "equities",
      },
    });
    expect(mocks.tx.classificationNode.update).toHaveBeenCalledWith({
      where: {
        id_schemeId_accountBookId: {
          id: "cash",
          schemeId: "assetClass",
          accountBookId: "book",
        },
      },
      data: { name: "Cash Holdings", parentId: "equities", sortOrder: 0 },
    });
  });
  it("reorders siblings and handles an edge without writes", async () => {
    await moveAssetClass({
      data: { accountBookId: "book", id: "equities", direction: "up" },
    });
    expect(mocks.tx.classificationNode.update).not.toHaveBeenCalled();
    await moveAssetClass({
      data: { accountBookId: "book", id: "equities", direction: "down" },
    });
    expect(mocks.tx.classificationNode.update).toHaveBeenNthCalledWith(1, {
      where: {
        id_schemeId_accountBookId: {
          id: "cash",
          schemeId: "assetClass",
          accountBookId: "book",
        },
      },
      data: { sortOrder: 0 },
    });
    expect(mocks.tx.classificationNode.update).toHaveBeenNthCalledWith(2, {
      where: {
        id_schemeId_accountBookId: {
          id: "equities",
          schemeId: "assetClass",
          accountBookId: "book",
        },
      },
      data: { sortOrder: 1 },
    });
  });
  it.each(["cash", null])(
    "reassigns all accounts before deleting a leaf (%s)",
    async (replacementId) => {
      mocks.tx.classificationNode.findUnique.mockResolvedValueOnce({
        ...nodes[0],
        children: [],
        assignments: [{ accountId: "active" }, { accountId: "archived" }],
      });
      await deleteAssetClass({
        data: { accountBookId: "book", id: "equities", replacementId },
      });
      expect(mocks.tx.accountClassification.deleteMany).toHaveBeenCalledWith({
        where: {
          accountBookId: "book",
          schemeId: "assetClass",
          accountId: { in: ["active", "archived"] },
        },
      });
      if (replacementId)
        expect(mocks.tx.accountClassification.createMany).toHaveBeenCalledWith({
          data: ["active", "archived"].map((accountId) => ({
            accountId,
            accountBookId: "book",
            schemeId: "assetClass",
            nodeId: "cash",
          })),
        });
      else
        expect(
          mocks.tx.accountClassification.createMany,
        ).not.toHaveBeenCalled();
      expect(mocks.tx.classificationNode.delete).toHaveBeenCalled();
    },
  );
  it("rejects deletion of a parent and stale replacements without writes", async () => {
    mocks.tx.classificationNode.findUnique.mockResolvedValueOnce({
      ...nodes[0],
      children: [{ id: "child" }],
      assignments: [],
    });
    await expect(
      deleteAssetClass({
        data: { accountBookId: "book", id: "equities", replacementId: null },
      }),
    ).rejects.toThrow("child classes");
    mocks.tx.classificationNode.findUnique
      .mockResolvedValueOnce({
        ...nodes[0],
        children: [],
        assignments: [{ accountId: "a" }],
      })
      .mockResolvedValueOnce(null);
    await expect(
      deleteAssetClass({
        data: {
          accountBookId: "book",
          id: "equities",
          replacementId: "deleted",
        },
      }),
    ).rejects.toThrow("no longer available");
    expect(mocks.tx.accountClassification.deleteMany).not.toHaveBeenCalled();
    expect(mocks.tx.classificationNode.delete).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it("rejects unauthorized writes before entering the transaction", async () => {
    mocks.guard.mockRejectedValueOnce(new Error("Denied"));
    await expect(
      saveAssetClass({
        data: { accountBookId: "other", name: "Class", parentId: null },
      }),
    ).rejects.toThrow("Denied");
    expect(mocks.lock).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it("keeps cache invalidation out of rolled-back failures", async () => {
    mocks.tx.classificationNode.create.mockRejectedValueOnce(
      new Error("Write failed"),
    );
    await expect(
      saveAssetClass({
        data: { accountBookId: "book", name: "New", parentId: null },
      }),
    ).rejects.toThrow("Write failed");
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it("rejects missing replacement decisions and stale node edits", async () => {
    expect(() =>
      deleteAssetClass({
        data: { accountBookId: "book", id: "equities" } as never,
      }),
    ).toThrow();
    await expect(
      saveAssetClass({
        data: {
          accountBookId: "book",
          id: "deleted",
          name: "New",
          parentId: null,
        },
      }),
    ).rejects.toThrow("no longer available");
  });
});
