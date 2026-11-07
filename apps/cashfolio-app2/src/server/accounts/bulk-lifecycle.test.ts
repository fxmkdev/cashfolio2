import { beforeEach, expect, it, vi } from "vitest";
import type { OrganizeSnapshot } from "../../shared/account-organize/types";

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
vi.mock("../mutation-guard.server", () => ({
  ensureAuthorizedAccountBookMutation: mocks.authorize,
}));
vi.mock("../account-book-mutation.server", () => ({
  withAccountBookMutation: mocks.transaction,
}));
vi.mock("../database-conflict-retry", () => ({
  withDatabaseConflictRetry: (operation: () => unknown) => operation(),
}));
vi.mock("../period/cache/period-base-data-cache", () => ({
  invalidatePeriodBaseDataCacheForAccountBook: mocks.invalidate,
}));
vi.mock("./organize-data", () => ({ readOrganizeSnapshot: mocks.read }));
vi.mock("./mutations/status", () => ({
  archiveAccountOperation: mocks.archiveAccount,
  archiveAccountGroupOperation: mocks.archiveGroup,
  unarchiveAccountOperation: mocks.unarchiveAccount,
  unarchiveAccountGroupOperation: mocks.unarchiveGroup,
}));
vi.mock("./mutations/delete", () => ({
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
  "validates current %s eligibility for every row before writing",
  async (action) => {
    snapshot.actionAvailability.group = {
      archivable: false,
      deletable: false,
      unarchivable: false,
      archiveDisabledReason: "Active children",
      deleteDisabledReason: "Nonempty group",
    };
    // Explicitly selecting the child does not make its parent eligible.
    snapshot.nodes[0].parentId = "group";
    const endpoint =
      action === "archive" ? archiveAccountTreeItems : deleteAccountTreeItems;
    await expect(
      endpoint({ data: { accountBookId: "book", items } }),
    ).rejects.toThrow(
      action === "archive" ? "Active children" : "Nonempty group",
    );
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

it("does not unarchive an ineligible child even when its archived parent is selected first", async () => {
  prepareUnarchive();
  snapshot.nodes[0].parentId = "group";
  snapshot.actionAvailability.account.unarchivable = false;
  snapshot.actionAvailability.account.unarchiveDisabledReason =
    "Its parent group is archived";
  await expect(
    unarchiveAccountTreeItems({
      data: { accountBookId: "book", items: items.toReversed() },
    }),
  ).rejects.toThrow("account: Its parent group is archived");
  expect(mocks.changed).toEqual([]);
  expect(mocks.invalidate).not.toHaveBeenCalled();
});

it("rejects a bulk Unarchive target that is no longer archived before writing any rows", async () => {
  prepareUnarchive();
  snapshot.nodes[1].isActive = true;
  snapshot.actionAvailability.group.unarchivable = false;
  snapshot.actionAvailability.group.unarchiveDisabledReason = "Already active";
  await expect(
    unarchiveAccountTreeItems({ data: { accountBookId: "book", items } }),
  ).rejects.toThrow("Already active");
  expect(mocks.changed).toEqual([]);
});
