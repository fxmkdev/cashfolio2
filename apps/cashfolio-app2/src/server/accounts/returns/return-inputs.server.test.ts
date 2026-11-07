import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  snapshot: vi.fn(),
  execute: vi.fn(),
  book: vi.fn(),
  accounts: vi.fn(),
  groups: vi.fn(),
  classes: vi.fn(),
  opening: vi.fn(),
  transactions: vi.fn(),
}));
vi.mock("../../../prisma.server", () => ({
  prisma: { $transaction: mocks.snapshot },
}));
import { loadAccountReturnInputs } from "./return-inputs.server";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.snapshot.mockImplementation(async (read) =>
    read({
      $executeRaw: mocks.execute,
      accountBook: { findUniqueOrThrow: mocks.book },
      account: { findMany: mocks.accounts },
      accountGroup: { findMany: mocks.groups },
      classificationNode: { findMany: mocks.classes },
      booking: { groupBy: mocks.opening },
      transaction: { findMany: mocks.transactions },
    }),
  );
  mocks.book.mockResolvedValue({
    startDate: new Date("2026-01-01T00:00:00Z"),
    referenceCurrency: "chf",
    periodCacheRevision: "revision",
  });
  mocks.accounts.mockResolvedValue([
    { id: "a", classifications: [{ nodeId: "class" }] },
  ]);
  mocks.groups.mockResolvedValue([]);
  mocks.classes.mockResolvedValue([]);
  mocks.opening.mockResolvedValue([
    { accountId: "a", _sum: { value: "0.10000000000000000001" } },
  ]);
  mocks.transactions.mockResolvedValue([]);
});
it("reads a single consistent revision, preserves decimal opening quantities, and includes spanning transactions", async () => {
  const result = await loadAccountReturnInputs(
    "book",
    new Date("2026-01-03T00:00:00Z"),
  );
  expect(mocks.snapshot).toHaveBeenCalledWith(expect.any(Function), {
    isolationLevel: "RepeatableRead",
    timeout: 30_000,
  });
  expect(mocks.execute.mock.calls[0]![0][0]).toContain("READ ONLY");
  expect(result.revision).toBe("revision");
  expect(result.initialBalances.get("a")?.toString()).toBe(
    "0.10000000000000000001",
  );
  expect(result.referenceCurrency).toBe("CHF");
  expect(result.accounts[0]?.assetClassId).toBe("class");
  // Separate existential bounds include transfers from before book start to after as-of.
  expect(mocks.transactions.mock.calls[0]![0].where).toEqual({
    accountBookId: "book",
    AND: [
      {
        bookings: { some: { date: { gte: new Date("2026-01-01T00:00:00Z") } } },
      },
      {
        bookings: { some: { date: { lt: new Date("2026-01-04T00:00:00Z") } } },
      },
    ],
  });
});
it("retains complete peers and paginates without truncating a busy book", async () => {
  const transaction = (id: string) => ({
    id,
    description: "Transfer",
    bookings: [
      {
        id: `${id}-out`,
        accountId: "a",
        date: new Date("2026-01-02T00:00:00Z"),
        value: "-100",
        unit: "CURRENCY",
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        description: "Outgoing",
        account: { type: "BALANCE", equityAccountSubtype: null },
      },
      {
        id: `${id}-in`,
        accountId: "b",
        date: new Date("2026-01-05T00:00:00Z"),
        value: "100",
        unit: "CURRENCY",
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        description: "Incoming",
        account: { type: "BALANCE", equityAccountSubtype: null },
      },
    ],
  });
  mocks.transactions
    .mockResolvedValueOnce(
      Array.from({ length: 200 }, (_, index) => transaction(String(index))),
    )
    .mockResolvedValueOnce([transaction("last")]);
  const result = await loadAccountReturnInputs(
    "book",
    new Date("2026-01-03T00:00:00Z"),
  );
  expect(result.transactions).toHaveLength(201);
  expect(result.transactions[0]!.bookings[1]!.date.toISOString()).toContain(
    "2026-01-05",
  );
  expect(result.transactions[0]!.bookings[0]!.value.toString()).toBe("-100");
  expect(mocks.transactions.mock.calls[1]![0]).toMatchObject({
    cursor: { id_accountBookId: { id: "199", accountBookId: "book" } },
    skip: 1,
  });
});

it("restricts ledger transactions to the selected account while retaining complete peers", async () => {
  await loadAccountReturnInputs("book", new Date("2026-01-03Z"), "a");
  expect(mocks.transactions.mock.calls[0]![0].where.bookings).toEqual({
    some: { accountId: "a" },
  });
  expect(
    mocks.transactions.mock.calls[0]![0].select.bookings.where,
  ).toBeUndefined();
});
