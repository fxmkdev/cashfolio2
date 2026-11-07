import type { OrganizeMove } from "../shared/hierarchy-organize/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  transaction: vi.fn(),
  lock: vi.fn(),
  authorizeRead: vi.fn(),
  authorizeWrite: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validator: (data: unknown) => unknown = (data) => data;
    const chain = {
      validator: (next: typeof validator) => {
        validator = next;
        return chain;
      },
      handler:
        (handler: (value: { data: unknown }) => unknown) =>
        ({ data }: { data: unknown }) =>
          handler({ data: validator(data) }),
    };
    return chain;
  },
}));
vi.mock("../prisma.server", () => ({
  prisma: { $transaction: mocks.transaction },
}));
vi.mock("../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId: mocks.authorizeRead,
}));
vi.mock("./mutation-guard.server", () => ({
  ensureAuthorizedAccountBookMutation: mocks.authorizeWrite,
}));
vi.mock("./account-book-mutation.server", () => ({
  withAccountBookMutation: mocks.lock,
}));
vi.mock("./database-conflict-retry", () => ({
  withDatabaseConflictRetry: (operation: () => unknown) => operation(),
}));
vi.mock("./period/cache/period-base-data-cache", () => ({
  invalidatePeriodBaseDataCacheForAccountBook: mocks.invalidate,
}));
import {
  getAssetClassOrganizeData,
  moveAssetClassTreeItems,
} from "./asset-class-organize";

const initial = [
  {
    id: "first",
    name: "First",
    parentId: null as string | null,
    sortOrder: 0,
    assignments: [{ account: { isActive: true } }],
  },
  {
    id: "child",
    name: "Child",
    parentId: "first",
    sortOrder: 0,
    assignments: [{ account: { isActive: false } }],
  },
  { id: "last", name: "Last", parentId: null, sortOrder: 1, assignments: [] },
];
let records = structuredClone(initial);
const accountBookId = "book";
beforeEach(() => {
  vi.resetAllMocks();
  records = structuredClone(initial);
  mocks.read.mockImplementation(async () => structuredClone(records));
  mocks.write.mockImplementation(async ({ where, data }) =>
    Object.assign(
      records.find((node) => node.id === where.id_schemeId_accountBookId.id)!,
      data,
    ),
  );
  const tx = {
    classificationNode: { findMany: mocks.read, update: mocks.write },
  };
  const transaction = async (operation: (value: unknown) => unknown) => {
    const before = structuredClone(records);
    try {
      return await operation(tx);
    } catch (error) {
      records = before;
      throw error;
    }
  };
  mocks.transaction.mockImplementation(transaction);
  mocks.lock.mockImplementation((_id, operation) => transaction(operation));
});
const snapshot = () => getAssetClassOrganizeData({ data: { accountBookId } });
async function move(
  overrides: Partial<OrganizeMove & { version: string }> = {},
) {
  const before = await snapshot();
  return moveAssetClassTreeItems({
    data: {
      accountBookId,
      version: before.version,
      items: [{ id: "first", nodeType: "assetClass" }],
      parentId: "last",
      placement: "last",
      ...overrides,
    },
  });
}

describe("asset class organization", () => {
  it("authorizes a coherent scoped snapshot with counts and fresh deletion eligibility", async () => {
    const before = await snapshot();
    expect(mocks.authorizeRead).toHaveBeenCalledWith(accountBookId);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead",
    });
    expect(mocks.read).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountBookId, schemeId: "assetClass" },
      }),
    );
    expect(before.nodes[0]).toMatchObject({
      activeCount: 1,
      archivedCount: 0,
      nodeType: "assetClass",
    });
    expect(before.nodes[0]).not.toHaveProperty("isCashAccount");
    expect(before.actionAvailability.first.deletable).toBe(false);
    expect(before.actionAvailability.child.deletable).toBe(true);
    records[0].assignments.push({ account: { isActive: false } });
    expect((await snapshot()).version).toBe(before.version);
    records.reverse();
    expect((await snapshot()).version).toBe(before.version);
  });
  it("serializes subtree moves and writes structural fields only", async () => {
    const result = await move();
    expect(mocks.authorizeWrite).toHaveBeenCalledWith(accountBookId);
    expect(mocks.lock).toHaveBeenCalledWith(
      accountBookId,
      expect.any(Function),
    );
    expect(result.changed).toBe(true);
    expect(records.find((node) => node.id === "first")?.parentId).toBe("last");
    expect(records.find((node) => node.id === "child")?.parentId).toBe("first");
    expect(records[0].assignments).toEqual(initial[0].assignments);
    for (const [call] of mocks.write.mock.calls) {
      expect(Object.keys(call.data).sort()).toEqual(["parentId", "sortOrder"]);
      expect(call.where.id_schemeId_accountBookId).toMatchObject({
        accountBookId,
        schemeId: "assetClass",
      });
    }
    expect(mocks.invalidate).toHaveBeenCalledOnce();
    expect(result.snapshot).toEqual(await snapshot());
  });
  it("does not write or invalidate an effective no-op", async () => {
    expect((await move({ parentId: null, placement: "first" })).changed).toBe(
      false,
    );
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it.each([
    { version: "stale" },
    { parentId: "foreign" },
    { parentId: "child" },
    { items: [{ id: "foreign", nodeType: "assetClass" as const }] },
    { placement: "before" as const, anchorId: "child", parentId: null },
    {
      items: [
        { id: "first", nodeType: "assetClass" as const },
        { id: "first", nodeType: "assetClass" as const },
      ],
    },
  ])("rejects invalid or stale moves atomically: %j", async (overrides) => {
    await expect(move(overrides)).rejects.toThrow();
    expect(records).toEqual(initial);
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it("validates resulting sibling names before writing", async () => {
    records.push({
      id: "duplicate",
      name: "First",
      parentId: "last",
      sortOrder: 0,
      assignments: [],
    });
    await expect(move()).rejects.toThrow("already exists");
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("rolls back earlier updates if a later write fails", async () => {
    mocks.write
      .mockImplementationOnce(async ({ data }) =>
        Object.assign(records[0], data),
      )
      .mockRejectedValueOnce(new Error("Write failed"));
    await expect(move()).rejects.toThrow("Write failed");
    expect(records).toEqual(initial);
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it("checks permissions before reading or locking", async () => {
    mocks.authorizeRead.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(snapshot()).rejects.toThrow("Forbidden");
    expect(mocks.read).not.toHaveBeenCalled();
    mocks.authorizeWrite.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(move()).rejects.toThrow("Forbidden");
    expect(mocks.lock).not.toHaveBeenCalled();
  });
});
