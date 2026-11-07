import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  OrganizeNode,
  OrganizeMove,
} from "../../../shared/account-organize/types";

const mocks = vi.hoisted(() => ({
  nodes: [] as OrganizeNode[],
  otherAccountNames: [] as { name: string }[],
  failId: "",
  authorizeRead: vi.fn(),
  authorizeWrite: vi.fn(),
  invalidate: vi.fn(),
  accountRead: vi.fn(),
  groupRead: vi.fn(),
  accountWrite: vi.fn(),
  groupWrite: vi.fn(),
  transaction: vi.fn(),
  bookings: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (data: unknown) => unknown = (data) => data;
    const chain = {
      validator: (validator: typeof validate) => {
        validate = validator;
        return chain;
      },
      handler:
        (handler: (args: { data: unknown }) => unknown) =>
        ({ data }: { data: unknown }) =>
          handler({ data: validate(data) }),
    };
    return chain;
  },
}));
vi.mock("../../../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId: mocks.authorizeRead,
}));
vi.mock("../../mutation-guard.server", () => ({
  ensureAuthorizedAccountBookMutation: mocks.authorizeWrite,
}));
vi.mock("../../period/cache/period-base-data-cache", () => ({
  invalidatePeriodBaseDataCacheForAccountBook: mocks.invalidate,
}));
vi.mock("../../database-conflict-retry", () => ({
  withDatabaseConflictRetry: (operation: () => unknown) => operation(),
}));
vi.mock("../../../prisma.server", () => ({
  prisma: { $transaction: mocks.transaction },
}));
vi.mock("../../account-book-mutation.server", () => ({
  withAccountBookMutation: (_id: string, operation: unknown) =>
    mocks.transaction(operation),
}));

import { getAccountOrganizeData, moveAccountTreeItems } from "./handlers";
import { organizeVersion } from "./data";
import { validateOrganizeBook, validateOrganizeMove } from "./input";

const accountBookId = "book";
const initial: OrganizeNode[] = [
  {
    id: "group",
    nodeType: "accountGroup",
    name: "Group",
    parentId: null,
    sortOrder: null,
    isActive: true,
    isCashAccount: false,
    unit: null,
  },
  {
    id: "cash",
    nodeType: "accountGroup",
    name: "Cash",
    parentId: null,
    sortOrder: null,
    isActive: true,
    isCashAccount: true,
    unit: null,
  },
  {
    id: "account",
    nodeType: "account",
    name: "Account",
    parentId: "group",
    sortOrder: null,
    isActive: true,
    isCashAccount: false,
    unit: "CURRENCY",
  },
  {
    id: "archived",
    nodeType: "account",
    name: "Archived",
    parentId: "group",
    sortOrder: 5,
    isActive: false,
    isCashAccount: false,
    unit: "CURRENCY",
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.nodes = structuredClone(initial);
  mocks.otherAccountNames = [];
  mocks.failId = "";
  mocks.bookings.mockResolvedValue([]);
  mocks.accountRead.mockImplementation(async (query) =>
    typeof query.where.type === "object" || query.where.id
      ? mocks.otherAccountNames
      : mocks.nodes
          .filter((n) => n.nodeType === "account")
          .map(({ parentId, nodeType: _nodeType, ...node }) => ({
            ...node,
            groupId: parentId,
          })),
  );
  mocks.groupRead.mockImplementation(async (query) =>
    typeof query.where.type === "object" || query.where.id
      ? []
      : mocks.nodes
          .filter((n) => n.nodeType === "accountGroup")
          .map(({ parentId, nodeType: _nodeType, unit: _unit, ...node }) => ({
            ...node,
            parentGroupId: parentId,
          })),
  );
  const update = async ({
    where,
    data,
  }: {
    where: { id_accountBookId: { id: string } };
    data: {
      groupId?: string | null;
      parentGroupId?: string | null;
      sortOrder: number | null;
      isCashAccount: boolean;
    };
  }) => {
    const id = where.id_accountBookId.id;
    if (id === mocks.failId) throw new Error("Database write failed");
    const node = mocks.nodes.find((n) => n.id === id)!;
    Object.assign(node, {
      parentId: "groupId" in data ? data.groupId : data.parentGroupId,
      sortOrder: data.sortOrder,
      ...(data.isCashAccount === undefined
        ? {}
        : { isCashAccount: data.isCashAccount }),
    });
    return node;
  };
  mocks.accountWrite.mockImplementation(update);
  mocks.groupWrite.mockImplementation(update);
  const tx = {
    booking: { groupBy: mocks.bookings },
    account: { findMany: mocks.accountRead, update: mocks.accountWrite },
    accountGroup: { findMany: mocks.groupRead, update: mocks.groupWrite },
  };
  mocks.transaction.mockImplementation(
    async (operation: (tx: unknown) => unknown) => {
      const before = structuredClone(mocks.nodes);
      try {
        return await operation(tx);
      } catch (error) {
        mocks.nodes = before;
        throw error;
      }
    },
  );
});

async function snapshot() {
  return getAccountOrganizeData({ data: { accountBookId } });
}
async function save(
  overrides: Partial<OrganizeMove & { version: string }> = {},
) {
  const before = await snapshot();
  return moveAccountTreeItems({
    data: {
      accountBookId,
      version: before.version,
      items: [initial[0]],
      parentId: "cash",
      placement: "last",
      ...overrides,
    },
  });
}

describe("organize server boundary", () => {
  it("authorizes coherent metadata reads and scopes both queries to balance items", async () => {
    const result = await snapshot();
    expect(mocks.authorizeRead).toHaveBeenCalledWith(accountBookId);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead",
    });
    for (const read of [mocks.accountRead, mocks.groupRead])
      expect(read).toHaveBeenCalledWith(
        expect.objectContaining({ where: { accountBookId, type: "BALANCE" } }),
      );
    expect(result.nodes).toHaveLength(4);
    expect(organizeVersion(result.nodes.toReversed())).toBe(result.version);
  });
  it("does not access records when read or mutation authorization fails", async () => {
    mocks.authorizeRead.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(snapshot()).rejects.toThrow("Forbidden");
    expect(mocks.transaction).not.toHaveBeenCalled();
    mocks.authorizeWrite.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(
      moveAccountTreeItems({
        data: {
          accountBookId,
          version: "v",
          items: [initial[0]],
          parentId: "cash",
          placement: "last",
        },
      }),
    ).rejects.toThrow("Forbidden");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("saves complete subtree changes, preserves unrelated fields and returns the canonical snapshot", async () => {
    const result = await save();
    expect(mocks.authorizeWrite).toHaveBeenCalledWith(accountBookId);
    expect(
      result.snapshot.nodes
        .filter((n) => ["group", "account", "archived"].includes(n.id))
        .every((n) => n.isCashAccount),
    ).toBe(true);
    expect(result.changed).toBe(true);
    for (const write of [mocks.accountWrite, mocks.groupWrite])
      for (const [args] of write.mock.calls)
        expect(Object.keys(args.data).sort()).toEqual(
          expect.arrayContaining(["sortOrder", "isCashAccount"]),
        );
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
  });
  it("does not write or invalidate caches for a no-op", async () => {
    const result = await save({
      items: [initial[2]],
      parentId: "group",
      placement: "last",
    });
    expect(result.changed).toBe(false);
    expect(mocks.accountWrite).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it("retains editor name validation against category/system accounts at Top Level", async () => {
    mocks.otherAccountNames = [{ name: "account" }];
    const before = await snapshot();
    await expect(save({ items: [initial[2]], parentId: null })).rejects.toThrow(
      "already exists",
    );
    expect(await snapshot()).toEqual(before);
    expect(mocks.accountWrite).not.toHaveBeenCalled();
  });
  it("rejects stale moves before any writes", async () => {
    await expect(save({ version: "old" })).rejects.toThrow("hierarchy changed");
    expect(mocks.accountWrite).not.toHaveBeenCalled();
    expect(mocks.groupWrite).not.toHaveBeenCalled();
  });
  it.each([
    { items: [{ id: "foreign", nodeType: "account" as const }] },
    { parentId: "foreign" },
    { parentId: "account" },
    { parentId: "group" },
    { items: [initial[0], initial[0]] },
  ])("atomically rejects invalid references: %j", async (overrides) => {
    const before = await snapshot();
    await expect(save(overrides)).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
    expect(mocks.groupWrite).not.toHaveBeenCalled();
  });
  it("rolls back earlier updates when a later write fails", async () => {
    const before = await snapshot();
    mocks.failId = "group";
    await expect(save()).rejects.toThrow("Database write failed");
    expect(mocks.accountWrite).toHaveBeenCalled();
    expect(await snapshot()).toEqual(before);
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it("rejects stale moves after a concurrent metadata change", async () => {
    const result = await save();
    mocks.nodes[0].name = "Concurrent rename";
    const before = await snapshot();
    await expect(save({ version: result.snapshot.version })).rejects.toThrow(
      "hierarchy changed",
    );
    expect(await snapshot()).toEqual(before);
  });
  it("returns fresh eligibility without invalidating movement versions for booking changes", async () => {
    const before = await snapshot();
    mocks.bookings.mockResolvedValue([
      { accountId: "account", _count: 1, _sum: { value: 10 } },
    ]);
    const after = await snapshot();
    expect(after.version).toBe(before.version);
    expect(after.actionAvailability.account).toMatchObject({
      deletable: false,
      archivable: false,
    });
    expect(after.actionAvailability.group).toMatchObject({
      deletable: false,
      archivable: false,
    });
    expect(after.actionAvailability.archived.unarchivable).toBe(true);
    mocks.nodes[0].isActive = false;
    expect((await snapshot()).actionAvailability.archived.unarchivable).toBe(
      false,
    );
  });
  it("allows archiving a booked zero-balance account but never deleting it", async () => {
    mocks.bookings.mockResolvedValue([
      { accountId: "account", _count: 2, _sum: { value: 0 } },
    ]);
    const result = await snapshot();
    expect(result.actionAvailability.account).toMatchObject({
      archivable: true,
      deletable: false,
    });
    expect(mocks.bookings).toHaveBeenCalledWith({
      by: ["accountId"],
      where: { accountBookId, accountId: { in: ["account", "archived"] } },
      _count: true,
      _sum: { value: true },
    });
  });
  it("counts hidden archived children for deletion without preventing group archive", async () => {
    mocks.nodes.find((node) => node.id === "account")!.isActive = false;
    const result = await snapshot();
    expect(result.actionAvailability.group).toMatchObject({
      archivable: true,
      deletable: false,
    });
    expect(result.actionAvailability.cash).toMatchObject({
      archivable: true,
      deletable: true,
    });
  });
});

describe("organize input contracts", () => {
  it.each(["income", "expense"] as const)(
    "organizes the %s scope without accepting financial fields",
    async (scope) => {
      mocks.nodes = mocks.nodes.map((node) => ({
        ...node,
        isCashAccount: false,
        unit: null,
      }));
      mocks.bookings.mockResolvedValue([
        { accountId: "account", _count: 2, _sum: { value: 10 } },
      ]);
      const before = await getAccountOrganizeData({
        data: { accountBookId, scope },
      });
      for (const read of [mocks.accountRead, mocks.groupRead]) {
        expect(read).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              accountBookId,
              type: "EQUITY",
              equityAccountSubtype: scope.toUpperCase(),
            },
          }),
        );
      }
      expect(before.actionAvailability.account).toMatchObject({
        archivable: true,
        deletable: false,
      });
      const result = await moveAccountTreeItems({
        data: {
          accountBookId,
          scope,
          version: before.version,
          items: [initial[0]],
          parentId: "cash",
          placement: "last",
        },
      });
      expect(result.changed).toBe(true);
      expect(
        result.snapshot.nodes.find((node) => node.id === "group")?.parentId,
      ).toBe("cash");
      for (const write of [mocks.accountWrite, mocks.groupWrite]) {
        for (const [call] of write.mock.calls)
          expect(call.data).not.toHaveProperty("isCashAccount");
      }
      expect(result.snapshot.nodes.every((node) => !node.isCashAccount)).toBe(
        true,
      );
      for (const move of [
        {
          items: [{ id: "other-category-type", nodeType: "account" as const }],
          parentId: "cash",
        },
        { items: [initial[2]], parentId: "system-equity-group" },
      ]) {
        await expect(
          moveAccountTreeItems({
            data: {
              accountBookId,
              scope,
              version: result.snapshot.version,
              placement: "last",
              ...move,
            },
          }),
        ).rejects.toThrow();
      }
    },
  );
  it("rejects unsupported hierarchy scopes", () => {
    expect(() =>
      validateOrganizeBook({ accountBookId, scope: "opening-balances" }),
    ).toThrow();
  });
  it("checks category Top Level names against roots outside the selected subtype, including legacy system roots", async () => {
    mocks.nodes = mocks.nodes.map((node) => ({
      ...node,
      isCashAccount: false,
      unit: null,
    }));
    mocks.otherAccountNames = [{ name: "Account" }];
    const before = await getAccountOrganizeData({
      data: { accountBookId, scope: "income" },
    });
    await expect(
      moveAccountTreeItems({
        data: {
          accountBookId,
          scope: "income",
          version: before.version,
          items: [initial[2]],
          parentId: null,
          placement: "last",
        },
      }),
    ).rejects.toThrow("already exists");
    expect(mocks.accountRead).toHaveBeenCalledWith({
      where: {
        accountBookId,
        groupId: null,
        id: { notIn: ["account", "archived"] },
      },
      select: { name: true },
    });
    expect(mocks.accountWrite).not.toHaveBeenCalled();
  });
  it("strips unrelated account and financial fields from moves", () => {
    expect(validateOrganizeBook({ accountBookId, ignored: true })).toEqual({
      accountBookId,
    });
    const input = {
      accountBookId,
      version: "v",
      items: [{ id: "a", nodeType: "account", name: "Ignored" }],
      parentId: null,
      placement: "last",
      openingBalance: 10,
    };
    expect(validateOrganizeMove(input)).toEqual({
      accountBookId,
      version: "v",
      items: [{ id: "a", nodeType: "account" }],
      parentId: null,
      placement: "last",
    });
  });
  it.each([
    null,
    {},
    { accountBookId },
    { accountBookId, version: "v", items: [], parentId: 5, placement: "last" },
    {
      accountBookId,
      version: "v",
      items: [{ id: "a", nodeType: "virtual" }],
      parentId: null,
      placement: "last",
    },
  ])("rejects malformed move input %j", (input) => {
    expect(() => validateOrganizeMove(input)).toThrow();
  });
});
