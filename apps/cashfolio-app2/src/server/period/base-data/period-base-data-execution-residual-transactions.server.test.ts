import { beforeEach, describe, expect, it, vi } from "vitest";
import { Unit } from "../../../.prisma-client/enums";
import { toMoney } from "../../../shared/money";
import { toNumericMoney } from "../../money-boundary";
const prisma = vi.hoisted(() => ({ transaction: { findMany: vi.fn() } }));
vi.mock("../../../prisma.server", () => ({ prisma }));
import { loadPeriodExecutionResidualTransactionsRaw } from "./period-base-data-execution-residual-transactions.server";

const args = {
  accountBookId: "book-1",
  incomeExpenseAccountIds: ["income", "expense"],
  excludedAccountIds: ["opening", "gain-loss"],
  periodStart: new Date("2026-02-01"),
  periodEndExclusive: new Date("2026-03-01"),
};
function transaction(id: string) {
  return {
    id,
    bookings: [
      {
        id: `${id}-booking`,
        accountId: "expense-usd",
        date: new Date("2026-01-31"),
        value: { toString: () => "123.123456789123456789" },
        unit: Unit.CURRENCY,
        currency: "USD",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        account: { name: "Travel" },
      },
    ],
  };
}

describe("execution-residual candidate loader", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.transaction.findMany.mockResolvedValue([]);
  });
  it("scopes candidates by book, completion period, income/expense, and excludes opening/explicit bookings", async () => {
    await loadPeriodExecutionResidualTransactionsRaw(
      {
        ...args,
        accountBookId: "book-1",
        periodStart: new Date("2026-01-01T00:00:00.000Z"),
        periodEndExclusive: new Date("2026-02-01T00:00:00.000Z"),
      },
      prisma,
    );

    expect(prisma.transaction.findMany).toHaveBeenCalledTimes(1);
    const [query] = prisma.transaction.findMany.mock.calls[0] ?? [];
    expect(query).toBeDefined();
    expect(toNumericMoney(query?.where?.accountBookId)).toBe("book-1");
    expect(toNumericMoney(query?.where?.AND)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bookings: expect.objectContaining({
            some: expect.objectContaining({
              date: {
                gte: new Date("2026-01-01T00:00:00.000Z"),
                lt: new Date("2026-02-01T00:00:00.000Z"),
              },
            }),
          }),
        }),
        expect.objectContaining({
          bookings: expect.objectContaining({
            some: expect.objectContaining({
              accountId: { in: ["income", "expense"] },
            }),
          }),
        }),
        expect.objectContaining({
          bookings: {
            none: {
              accountId: { in: ["opening", "gain-loss"] },
            },
          },
        }),
      ]),
    );
  });

  it("loads complete bookings in deterministic order and preserves Decimal precision", async () => {
    prisma.transaction.findMany.mockResolvedValueOnce([transaction("tx-1")]);
    const rows = await loadPeriodExecutionResidualTransactionsRaw(args, prisma);
    expect(rows[0]!.bookings[0]!.value.toString()).toBe(
      "123.123456789123456789",
    );
    expect(
      rows[0]!.bookings[0]!.value.equals(toMoney("123.123456789123456789")),
    ).toBe(true);
    expect(rows[0]!.bookings[0]!.date).toEqual(new Date("2026-01-31"));
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { id: "asc" },
        take: 200,
        select: expect.objectContaining({
          bookings: expect.objectContaining({
            orderBy: [{ date: "asc" }, { id: "asc" }],
          }),
        }),
      }),
    );
    const query = prisma.transaction.findMany.mock.calls[0]![0];
    expect(query.select.bookings).not.toHaveProperty("where");
    expect(query.where.AND).toEqual(
      expect.arrayContaining([
        { bookings: { none: { date: { gte: args.periodEndExclusive } } } },
        {
          bookings: {
            none: {
              accountId: { in: ["opening", "gain-loss"] },
            },
          },
        },
      ]),
    );
  });
  it("advances the composite cursor over full pages and stops on the final partial page", async () => {
    const page = Array.from({ length: 200 }, (_, i) => transaction(`tx-${i}`));
    prisma.transaction.findMany
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce([transaction("tx-last")]);
    const rows = await loadPeriodExecutionResidualTransactionsRaw(args, prisma);
    expect(rows).toHaveLength(201);
    expect(prisma.transaction.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.transaction.findMany.mock.calls[0]![0]).not.toHaveProperty(
      "cursor",
    );
    expect(prisma.transaction.findMany.mock.calls[1]![0]).toMatchObject({
      cursor: { id_accountBookId: { id: "tx-199", accountBookId: "book-1" } },
      skip: 1,
    });
  });
  it("returns an empty array when no candidates exist", async () => {
    expect(
      await loadPeriodExecutionResidualTransactionsRaw(args, prisma),
    ).toEqual([]);
    expect(prisma.transaction.findMany).toHaveBeenCalledTimes(1);
  });
});
