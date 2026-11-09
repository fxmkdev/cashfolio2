import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { Unit } from "../../.prisma-client/enums";
import {
  buildTransactionCreateData,
  cleanupTransactionHelpers,
  resetTransactionHelpers,
} from "./transactions-helpers.server.test-support";
describe("transactions helpers", () => {
  beforeEach(resetTransactionHelpers);
  afterEach(cleanupTransactionHelpers);

  test("builds nested transaction create payload with stable sort order", () => {
    const result = buildTransactionCreateData({
      accountBookId: "book-1",
      description: "new transaction",
      bookings: [
        {
          date: "2026-01-03T00:00:00.000Z",
          accountId: "asset-1",
          description: "first",
          unit: Unit.CURRENCY,
          currency: "CHF",
          value: 50,
        },
        {
          date: "2026-01-03T00:00:00.000Z",
          accountId: "equity-1",
          description: "second",
          unit: Unit.CURRENCY,
          currency: "CHF",
          value: -50,
        },
      ],
    });

    expect(result).toMatchObject({
      description: "new transaction",
      accountBookId: "book-1",
      bookings: {
        create: [
          {
            description: "first",
            value: "50",
            sortOrder: 0,
            account: {
              connect: {
                id_accountBookId: {
                  id: "asset-1",
                  accountBookId: "book-1",
                },
              },
            },
          },
          {
            description: "second",
            value: "-50",
            sortOrder: 1,
            account: {
              connect: {
                id_accountBookId: {
                  id: "equity-1",
                  accountBookId: "book-1",
                },
              },
            },
          },
        ],
      },
    });
  });

  test("rejects non-canonical dates while building transaction create payloads", () => {
    expect(() =>
      buildTransactionCreateData({
        accountBookId: "book-1",
        description: "shifted transaction",
        bookings: [
          {
            date: "2026-01-02T23:00:00.000Z",
            accountId: "asset-1",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: 50,
          },
          {
            date: "2026-01-02T23:00:00.000Z",
            accountId: "equity-1",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: -50,
          },
        ],
      }),
    ).toThrow("Date must be a valid UTC day.");
  });
});
