import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";

const prisma = vi.hoisted(() => ({
  transaction: {
    findMany: vi.fn(),
  },
}));

vi.mock("../../prisma.server", () => ({
  prisma,
}));

import { computeExecutionResidualRealization } from "./period-execution-residuals";

describe("computeExecutionResidualRealization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.transaction.findMany.mockResolvedValue([]);
  });

  it("converts cross-period completion candidates without realizing zero residuals", async () => {
    prisma.transaction.findMany
      .mockResolvedValueOnce([
        {
          id: "tx-cross-period",
          bookings: [
            {
              id: "booking-cash-chf",
              accountId: "asset-cash",
              date: new Date("2025-12-31T23:00:00.000Z"),
              value: -100,
              unit: Unit.CURRENCY,
              currency: "CHF",
              cryptocurrency: null,
              symbol: null,
              tradeCurrency: null,
              account: { name: "Cash" },
            },
            {
              id: "booking-expense-usd",
              accountId: "expense-usd",
              date: new Date("2026-01-15T00:00:00.000Z"),
              value: 100,
              unit: Unit.CURRENCY,
              currency: "USD",
              cryptocurrency: null,
              symbol: null,
              tradeCurrency: null,
              account: { name: "Travel USD" },
            },
          ],
        },
      ])
      .mockResolvedValueOnce([]);

    const contributions: Array<{
      accountId: string;
      realizedGainLoss: number;
    }> = [];
    const convertBookingToReference = vi.fn(
      async ({ value }: { value: number }) => value,
    );

    const result = await computeExecutionResidualRealization({
      accountBookId: "book-1",
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-02-01T00:00:00.000Z"),
      referenceCurrency: "CHF",
      trackedHoldingAccountIdSet: new Set<string>(),
      pageSize: 100,
      convertBookingToReference,
      onContribution: (contribution) => {
        contributions.push({
          accountId: contribution.accountId,
          realizedGainLoss: contribution.realizedGainLoss,
        });
      },
    });

    expect(result).toMatchObject({
      realizedGainLoss: 0,
      convertedCount: 2,
      skippedCount: 0,
    });
    expect(convertBookingToReference).toHaveBeenCalledTimes(2);
    expect(contributions).toEqual([]);
  });

  it("realizes cross-period residuals in the completion period", async () => {
    prisma.transaction.findMany
      .mockResolvedValueOnce([
        {
          id: "tx-cross-period-completion",
          bookings: [
            {
              id: "booking-expense-usd",
              accountId: "expense-usd",
              date: new Date("2026-01-31T00:00:00.000Z"),
              value: 100,
              unit: Unit.CURRENCY,
              currency: "USD",
              cryptocurrency: null,
              symbol: null,
              tradeCurrency: null,
              account: { name: "Travel USD" },
            },
            {
              id: "booking-cash-chf",
              accountId: "asset-cash",
              date: new Date("2026-02-01T00:00:00.000Z"),
              value: -90,
              unit: Unit.CURRENCY,
              currency: "CHF",
              cryptocurrency: null,
              symbol: null,
              tradeCurrency: null,
              account: { name: "Cash" },
            },
          ],
        },
      ])
      .mockResolvedValueOnce([]);

    const contributions: Array<{
      accountId: string;
      realizedGainLoss: number;
    }> = [];

    const result = await computeExecutionResidualRealization({
      accountBookId: "book-1",
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      referenceCurrency: "CHF",
      trackedHoldingAccountIdSet: new Set<string>(),
      pageSize: 100,
      convertBookingToReference: async ({ currency, value, date }) => {
        if (
          currency === "USD" &&
          value === 100 &&
          date.toISOString() === "2026-01-31T00:00:00.000Z"
        ) {
          return 80;
        }
        if (
          currency === "CHF" &&
          value === -90 &&
          date.toISOString() === "2026-02-01T00:00:00.000Z"
        ) {
          return -90;
        }
        return null;
      },
      onContribution: (contribution) => {
        contributions.push({
          accountId: contribution.accountId,
          realizedGainLoss: contribution.realizedGainLoss,
        });
      },
    });

    expect(result).toMatchObject({
      realizedGainLoss: -10,
      convertedCount: 2,
      skippedCount: 0,
    });
    expect(contributions).toEqual([
      {
        accountId: "expense-usd",
        realizedGainLoss: -10,
      },
    ]);
  });

  it("queries only income/expense candidates and excludes explicit gain/loss bookings", async () => {
    await computeExecutionResidualRealization({
      accountBookId: "book-1",
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-02-01T00:00:00.000Z"),
      referenceCurrency: "CHF",
      trackedHoldingAccountIdSet: new Set<string>(),
      pageSize: 100,
      convertBookingToReference: async ({ value }) => value,
      onContribution: () => undefined,
    });

    expect(prisma.transaction.findMany).toHaveBeenCalledTimes(1);
    const [query] = prisma.transaction.findMany.mock.calls[0] ?? [];
    expect(query).toBeDefined();
    expect(query?.where?.accountBookId).toBe("book-1");
    expect(query?.where?.AND).toEqual(
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
              account: {
                type: AccountType.EQUITY,
                equityAccountSubtype: {
                  in: [
                    EquityAccountSubtype.INCOME,
                    EquityAccountSubtype.EXPENSE,
                  ],
                },
              },
            }),
          }),
        }),
        expect.objectContaining({
          bookings: {
            none: {
              account: {
                type: AccountType.EQUITY,
                equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
              },
            },
          },
        }),
      ]),
    );
  });
});
