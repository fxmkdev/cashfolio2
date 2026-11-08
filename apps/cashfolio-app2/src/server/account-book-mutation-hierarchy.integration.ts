import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  account,
  bookId,
  createMutationDatabase,
  db,
  disposeMutationDatabase,
  expectRejected,
  groupUpdate,
  mutations,
  organize,
  race,
  resetMutationDatabase,
} from "./account-book-mutation.test-support";

describe("account-book mutation invariants against disposable PostgreSQL", () => {
  beforeAll(createMutationDatabase);
  beforeEach(resetMutationDatabase);
  afterAll(disposeMutationDatabase);

  it("serializes competing organize moves and rejects the stale hierarchy", async () => {
    const snapshot = await organize.getAccountOrganizeData({
      data: { accountBookId: bookId },
    });
    const move = (id: string, parentId: string) =>
      organize.moveAccountTreeItems({
        data: {
          accountBookId: bookId,
          version: snapshot.version,
          items: [{ id, nodeType: "accountGroup" }],
          parentId,
          placement: "last",
        },
      });
    const outcomes = await race(
      () => move("A", "B"),
      () => move("B", "A"),
    );
    expectRejected(outcomes, "hierarchy changed");
    expect(
      (
        await db.accountGroup.findUniqueOrThrow({
          where: { id_accountBookId: { id: "A", accountBookId: bookId } },
        })
      ).parentGroupId,
    ).toBe("B");
  });

  it("rejects a stale move after a concurrent group edit without replacing the newer state", async () => {
    const snapshot = await organize.getAccountOrganizeData({
      data: { accountBookId: bookId },
    });
    const moved = await organize.moveAccountTreeItems({
      data: {
        accountBookId: bookId,
        version: snapshot.version,
        items: [{ id: "A", nodeType: "accountGroup" }],
        parentId: "B",
        placement: "last",
      },
    });
    const outcomes = await race(
      () =>
        mutations.updateAccountGroup({
          data: { ...groupUpdate("B").data, name: "Renamed B" },
        }),
      () =>
        organize.moveAccountTreeItems({
          data: {
            accountBookId: bookId,
            version: moved.snapshot.version,
            items: [{ id: "A", nodeType: "accountGroup" }],
            parentId: null,
            placement: "last",
          },
        }),
    );
    expectRejected(outcomes, "hierarchy changed");
    const groups = await db.accountGroup.findMany({
      where: { accountBookId: bookId },
    });
    expect(groups.find((group) => group.id === "A")?.parentGroupId).toBe("B");
    expect(groups.find((group) => group.id === "B")?.name).toBe("Renamed B");
  });

  it("rolls back organize cash propagation, parent/order changes and cache revision on a later database failure", async () => {
    await mutations.createAccount({ data: account("Child", { groupId: "A" }) });
    await db.accountGroup.update({
      where: { id_accountBookId: { id: "B", accountBookId: bookId } },
      data: { isCashAccount: true },
    });
    const snapshot = await organize.getAccountOrganizeData({
      data: { accountBookId: bookId },
    });
    const revision = (
      await db.accountBook.findUniqueOrThrow({ where: { id: bookId } })
    ).periodCacheRevision;
    await db.$executeRawUnsafe(
      `CREATE FUNCTION reject_organize_update() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'organize write rejected'; END; $$ LANGUAGE plpgsql`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER reject_organize_update BEFORE UPDATE ON "AccountGroup" FOR EACH ROW WHEN (NEW.id = 'A') EXECUTE FUNCTION reject_organize_update()`,
    );
    try {
      await expect(
        organize.moveAccountTreeItems({
          data: {
            accountBookId: bookId,
            version: snapshot.version,
            items: [{ id: "A", nodeType: "accountGroup" }],
            parentId: "B",
            placement: "last",
          },
        }),
      ).rejects.toThrow("organize write rejected");
      expect(
        await organize.getAccountOrganizeData({
          data: { accountBookId: bookId },
        }),
      ).toEqual(snapshot);
      expect(
        (await db.accountBook.findUniqueOrThrow({ where: { id: bookId } }))
          .periodCacheRevision,
      ).toBe(revision);
    } finally {
      await db.$executeRawUnsafe(
        `DROP TRIGGER reject_organize_update ON "AccountGroup"`,
      );
      await db.$executeRawUnsafe(`DROP FUNCTION reject_organize_update()`);
    }
  });

  it("rejects simultaneous opposite group moves instead of committing a cycle", async () => {
    const outcomes = await race(
      () => mutations.updateAccountGroup(groupUpdate("A", "B")),
      () => mutations.updateAccountGroup(groupUpdate("B", "A")),
    );
    expectRejected(outcomes, "sub-groups");
    const groups = await db.accountGroup.findMany({ orderBy: { id: "asc" } });
    expect(groups.map((group) => [group.id, group.parentGroupId])).toEqual([
      ["A", "B"],
      ["B", null],
    ]);
  });
});
