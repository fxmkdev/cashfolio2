import { beforeEach, expect, it, vi } from "vitest";
import type { OrganizeSnapshot } from "../../../shared/accounts/organize/types";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  transaction: vi.fn(),
  read: vi.fn(),
  invalidate: vi.fn(),
  archiveAccount: vi.fn(),
  archiveGroup: vi.fn(),
  unarchiveAccount: vi.fn(),
  unarchiveGroup: vi.fn(),
  deleteAccount: vi.fn(),
  deleteGroup: vi.fn(),
  changed: [] as string[],
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: (validate: (input: unknown) => unknown) => ({
      handler:
        (handler: (args: { data: unknown }) => unknown) =>
        async ({ data }: { data: unknown }) =>
          handler({ data: validate(data) }),
    }),
  }),
}));
vi.mock("../../mutation-guard.server", () => ({
  ensureAuthorizedAccountBookMutation: mocks.authorize,
}));
vi.mock("../../account-book-mutation.server", () => ({
  withAccountBookMutation: mocks.transaction,
}));
vi.mock("../../database-conflict-retry.server", () => ({
  withDatabaseConflictRetry: (operation: () => unknown) => operation(),
}));
vi.mock("../../period/cache/period-base-data-cache.server", () => ({
  invalidatePeriodBaseDataCacheForAccountBook: mocks.invalidate,
}));
vi.mock("../organize/data.server", () => ({ readOrganizeSnapshot: mocks.read }));
vi.mock("./status.server", () => ({
  archiveAccountOperation: mocks.archiveAccount,
  archiveAccountGroupOperation: mocks.archiveGroup,
  unarchiveAccountOperation: mocks.unarchiveAccount,
  unarchiveAccountGroupOperation: mocks.unarchiveGroup,
}));
vi.mock("./delete.server", () => ({
  deleteAccountOperation: mocks.deleteAccount,
  deleteAccountGroupOperation: mocks.deleteGroup,
}));

import {
  archiveAccountTreeItems,
  unarchiveAccountTreeItems,
  deleteAccountTreeItems,
} from "./bulk-lifecycle";

const items = [
  { id: "account", nodeType: "account" as const },
  { id: "group", nodeType: "accountGroup" as const },
];
let snapshot: OrganizeSnapshot;
const tx = {};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.changed = [];
  snapshot = {
    version: "v",
    nodes: items.map((item) => ({
      ...item,
      name: item.id,
      parentId: null,
      sortOrder: 0,
      isActive: true,
      isCashAccount: false,
      unit: null,
    })),
    actionAvailability: Object.fromEntries(
      items.map((item) => [
        item.id,
        { archivable: true, deletable: true, unarchivable: false },
      ]),
    ),
  };
  mocks.read.mockImplementation(async () => structuredClone(snapshot));
  mocks.transaction.mockImplementation(
    async (_book, operation: (client: unknown) => unknown) => {
      const before = [...mocks.changed];
      try {
        return await operation(tx);
      } catch (error) {
        mocks.changed = before;
        throw error;
      }
    },
  );
  for (const operation of [
    mocks.archiveAccount,
    mocks.archiveGroup,
    mocks.unarchiveAccount,
    mocks.unarchiveGroup,
    mocks.deleteAccount,
    mocks.deleteGroup,
  ])
    operation.mockImplementation(async ({ id }: { id: string }) => {
      mocks.changed.push(id);
    });
});

it.each([
  archiveAccountTreeItems,
  unarchiveAccountTreeItems,
  deleteAccountTreeItems,
])(
  "authorizes and commits all explicit targets in one transaction",
  async (endpoint) => {
    if (endpoint === unarchiveAccountTreeItems) prepareUnarchive();
    await endpoint({ data: { accountBookId: "book", items } });
    expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith("book");
    expect(mocks.transaction).toHaveBeenCalledExactlyOnceWith(
      "book",
      expect.any(Function),
    );
    expect(mocks.read).toHaveBeenCalledWith(tx, "book", "balance");
    expect(mocks.changed).toEqual(["account", "group"]);
    expect(mocks.invalidate).toHaveBeenCalledExactlyOnceWith("book");
  },
);

it("does not access the database if authorization fails", async () => {
  mocks.authorize.mockRejectedValueOnce(new Error("Forbidden"));
  await expect(
    archiveAccountTreeItems({ data: { accountBookId: "book", items } }),
  ).rejects.toThrow("Forbidden");
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it.each([
  { invalid: [] },
  { invalid: [items[0], items[0]] },
  { invalid: [{ id: "a", nodeType: "assetClass" }] },
])(
  "rejects invalid target lists before the transaction: %j",
  async ({ invalid }) => {
    await expect(
      deleteAccountTreeItems({
        data: { accountBookId: "book", items: invalid } as never,
      }),
    ).rejects.toThrow();
    expect(mocks.transaction).not.toHaveBeenCalled();
  },
);

it.each(["foreign", "category", "missing"])(
  "rejects a target outside the balance hierarchy: %s",
  async (id) => {
    await expect(
      deleteAccountTreeItems({
        data: {
          accountBookId: "book",
          items: [items[0], { id, nodeType: "account" }],
        },
      }),
    ).rejects.toThrow("no longer available");
    expect(mocks.changed).toEqual([]);
  },
);

it.each(["archive", "delete"] as const)(
  "validates nonstructural %s eligibility for every row before writing",
  async (action) => {
    snapshot.nodes[0].parentId = "group";
    snapshot.actionAvailability.account.archivable = false;
    snapshot.actionAvailability.account.archiveDisabledReason =
      "Nonzero balance";
    snapshot.actionAvailability.account.deletable = false;
    snapshot.actionAvailability.account.deleteDisabledReason = "Has bookings";
    const endpoint =
      action === "archive" ? archiveAccountTreeItems : deleteAccountTreeItems;
    await expect(
      endpoint({ data: { accountBookId: "book", items } }),
    ).rejects.toThrow(
      action === "archive" ? "Nonzero balance" : "Has bookings",
    );
    expect(mocks.changed).toEqual([]);
    expect(mocks.invalidate).not.toHaveBeenCalled();
  },
);

it.each(["archive", "delete"] as const)(
  "processes selected children before parents for %s in either selection order",
  async (action) => {
    snapshot.nodes[0].parentId = "group";
    snapshot.actionAvailability.group.archivable = false;
    snapshot.actionAvailability.group.deletable = false;
    const endpoint =
      action === "archive" ? archiveAccountTreeItems : deleteAccountTreeItems;
    for (const targets of [items, items.toReversed()]) {
      mocks.changed = [];
      await endpoint({ data: { accountBookId: "book", items: targets } });
      expect(mocks.changed).toEqual(["account", "group"]);
    }
  },
);

it.each(["archive", "delete"] as const)(
  "does not change any rows when a required child is omitted from %s",
  async (action) => {
    snapshot.nodes[0].parentId = "group";
    snapshot.nodes.push({
      ...snapshot.nodes[0],
      id: "omitted",
      name: "Omitted Child",
      isActive: action === "archive",
    });
    const endpoint =
      action === "archive" ? archiveAccountTreeItems : deleteAccountTreeItems;
    await expect(
      endpoint({ data: { accountBookId: "book", items } }),
    ).rejects.toThrow("Omitted Child");
    expect(mocks.changed).toEqual([]);
    expect(mocks.invalidate).not.toHaveBeenCalled();
  },
);

it.each([
  archiveAccountTreeItems,
  unarchiveAccountTreeItems,
  deleteAccountTreeItems,
])("rolls back the batch when a later operation fails", async (endpoint) => {
  if (endpoint === unarchiveAccountTreeItems) prepareUnarchive();
  for (const operation of [
    mocks.archiveGroup,
    mocks.unarchiveGroup,
    mocks.deleteGroup,
  ])
    operation.mockRejectedValueOnce(new Error("Write failed"));
  await expect(
    endpoint({ data: { accountBookId: "book", items } }),
  ).rejects.toThrow("Write failed");
  expect(mocks.changed).toEqual([]);
  expect(mocks.invalidate).not.toHaveBeenCalled();
});

function prepareUnarchive() {
  for (const node of snapshot.nodes) {
    node.isActive = false;
    snapshot.actionAvailability[node.id].unarchivable = true;
  }
}

it("authorizes bulk Unarchive before reading the hierarchy", async () => {
  mocks.authorize.mockRejectedValueOnce(new Error("Forbidden"));
  await expect(
    unarchiveAccountTreeItems({ data: { accountBookId: "book", items } }),
  ).rejects.toThrow("Forbidden");
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("unarchives a selected parent before its child regardless of selection order", async () => {
  prepareUnarchive();
  snapshot.nodes[0].parentId = "group";
  snapshot.actionAvailability.account.unarchivable = false;
  snapshot.actionAvailability.account.unarchiveDisabledReason =
    "Its parent group is archived";
  for (const targets of [items, items.toReversed()]) {
    mocks.changed = [];
    await unarchiveAccountTreeItems({
      data: { accountBookId: "book", items: targets },
    });
    expect(mocks.changed).toEqual(["group", "account"]);
  }
});

it("still blocks Unarchive when the archived ancestor is not selected", async () => {
  prepareUnarchive();
  snapshot.nodes[0].parentId = "group";
  await expect(
    unarchiveAccountTreeItems({
      data: { accountBookId: "book", items: [items[0]] },
    }),
  ).rejects.toThrow("group");
  expect(mocks.changed).toEqual([]);
});

it("rejects a bulk Unarchive target that is no longer archived before writing any rows", async () => {
  prepareUnarchive();
  snapshot.nodes[1].isActive = true;
  snapshot.actionAvailability.group.unarchivable = false;
  snapshot.actionAvailability.group.unarchiveDisabledReason = "Already active";
  await expect(
    unarchiveAccountTreeItems({ data: { accountBookId: "book", items } }),
  ).rejects.toThrow("already active");
  expect(mocks.changed).toEqual([]);
});
