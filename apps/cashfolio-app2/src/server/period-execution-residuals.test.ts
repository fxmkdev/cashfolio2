import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";

const prisma = vi.hoisted(() => ({
  transaction: {
    findMany: vi.fn(),
  },
}));

vi.mock("../prisma.server", () => ({
  prisma,
}));

import { computeExecutionResidualRealization } from "./period-execution-residuals";

describe("computeExecutionResidualRealization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.transaction.findMany.mockResolvedValue([]);
  });

  it("skips realization when any non-explicit booking is outside the selected period", async () => {
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
      convertedCount: 0,
      skippedCount: 0,
    });
    expect(convertBookingToReference).not.toHaveBeenCalled();
    expect(contributions).toEqual([]);
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
              date: {
                lt: new Date("2026-01-01T00:00:00.000Z"),
              },
            },
          },
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
