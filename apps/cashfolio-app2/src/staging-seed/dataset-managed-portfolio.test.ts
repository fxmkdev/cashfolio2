import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { AccountType, Unit } from "../.prisma-client/enums";
import { addUtcDays, getOpeningBalancesBookingDate } from "../shared/date";
import { GAIN_LOSS_ACCOUNT_KEY, generateStagingDataset } from "./dataset";

describe("staging manually valued portfolio", () => {
  it("separates opening value, cash flows and statement performance", () => {
    const household = generateStagingDataset(new Date("2026-10-10Z")).books[0];
    const account = household.accounts.find(
      ({ key }) => key === "managed-portfolio",
    )!;
    expect(account).toMatchObject({
      name: "Managed Portfolio CHF",
      groupKey: "investments",
      type: AccountType.BALANCE,
      unit: Unit.CURRENCY,
      currency: "CHF",
      isActive: true,
      isCashAccount: false,
    });
    expect(account.symbol).toBeUndefined();
    expect(account.cryptocurrency).toBeUndefined();
    expect(account.tradeCurrency).toBeUndefined();

    const transactions = household.transactions.filter(({ bookings }) =>
      bookings.some(({ accountKey }) => accountKey === account.key),
    );
    const opening = transactions.find(({ bookings }) =>
      bookings.some(({ accountKey }) => accountKey === "opening"),
    )!;
    expect(opening.bookings).toEqual([
      expect.objectContaining({
        accountKey: account.key,
        date: getOpeningBalancesBookingDate(household.startDate),
        value: "50000",
      }),
      expect.objectContaining({ accountKey: "opening", value: "-50000" }),
    ]);

    const contributions = transactions.filter(
      ({ description }) => description === "Managed portfolio: contribution",
    );
    const withdrawals = transactions.filter(
      ({ description }) => description === "Managed portfolio: withdrawal",
    );
    expect(contributions).toHaveLength(36);
    expect(withdrawals).toHaveLength(3);
    for (const [cashFlows, portfolioValue, bankValue] of [
      [contributions, "250", "-250"],
      [withdrawals, "-1000", "1000"],
    ] as const) {
      for (const { bookings } of cashFlows) {
        expect(bookings).toHaveLength(2);
        expect(bookings).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              accountKey: account.key,
              value: portfolioValue,
            }),
            expect.objectContaining({
              accountKey: "current",
              value: bankValue,
            }),
          ]),
        );
      }
    }

    const valuations = household.transactions.filter(({ bookings }) =>
      bookings.some(({ accountKey }) => accountKey === GAIN_LOSS_ACCOUNT_KEY),
    );
    expect(valuations).toHaveLength(37);
    const adjustments = valuations.map(({ bookings, description }) => {
      expect(description).toBe("Managed portfolio: statement valuation");
      expect(bookings).toHaveLength(2);
      const portfolio = bookings.find(
        ({ accountKey }) => accountKey === account.key,
      )!;
      const equity = bookings.find(
        ({ accountKey }) => accountKey === GAIN_LOSS_ACCOUNT_KEY,
      )!;
      expect(new Decimal(portfolio.value).plus(equity.value).isZero()).toBe(
        true,
      );
      expect(portfolio.date).toEqual(equity.date);
      return portfolio.value;
    });
    expect(adjustments.slice(0, 6)).toEqual([
      "600",
      "-350",
      "450",
      "250",
      "-200",
      "500",
    ]);
    expect(adjustments.at(-1)).toBe("600");
    expect(Decimal.sum(...adjustments).toString()).toBe("8100");
    expect(
      Decimal.sum(
        ...transactions.flatMap(({ bookings }) =>
          bookings
            .filter(({ accountKey }) => accountKey === account.key)
            .map(({ value }) => value),
        ),
      ).toString(),
    ).toBe("64100");
    for (const { bookings } of transactions) {
      for (const booking of bookings) {
        expect(booking).toMatchObject({ unit: Unit.CURRENCY, currency: "CHF" });
      }
      expect(Decimal.sum(...bookings.map(({ value }) => value)).isZero()).toBe(
        true,
      );
    }
    expect(
      household.transactions.some(
        ({ description }) => description === "Currency rounding adjustment",
      ),
    ).toBe(false);
  });

  it.each([
    "2026-10-10",
    "2026-01-01",
    "2024-02-29",
    "2026-06-20",
    "2026-10-05",
  ])(
    "keeps monthly statements and cash flows within the book through %s",
    (day) => {
      const today = new Date(`${day}T00:00:00Z`);
      const dataset = generateStagingDataset(today);
      expect(generateStagingDataset(today)).toEqual(dataset);
      const household = dataset.books[0];
      const transactions = household.transactions.filter(({ description }) =>
        description.startsWith("Managed portfolio:"),
      );
      const valuations = transactions.filter(
        ({ description }) =>
          description === "Managed portfolio: statement valuation",
      );
      expect(valuations).toHaveLength(37);
      expect(
        new Set(
          valuations.map(({ bookings }) =>
            bookings[0].date.toISOString().slice(0, 7),
          ),
        ).size,
      ).toBe(37);
      expect(valuations[0].bookings[0].date.toISOString().slice(0, 7)).toBe(
        household.startDate.toISOString().slice(0, 7),
      );
      expect(valuations.at(-1)!.bookings[0].date).toEqual(today);
      for (const { bookings } of valuations.slice(0, -1)) {
        expect(addUtcDays(bookings[0].date, 1).getUTCDate()).toBe(1);
      }
      for (const { description, bookings } of transactions) {
        for (const booking of bookings) {
          expect(
            booking.date >= household.startDate && booking.date <= today,
          ).toBe(true);
          expect(booking.date.toISOString().slice(11)).toBe("00:00:00.000Z");
        }
        if (description.endsWith("contribution")) {
          expect(bookings[0].date.getUTCDate()).toBe(5);
        } else if (description.endsWith("withdrawal")) {
          expect(bookings[0].date.toISOString().slice(5, 10)).toBe("06-20");
        }
      }
      if (day === "2026-10-05") {
        expect(
          transactions.filter(({ description }) =>
            description.endsWith("contribution"),
          ),
        ).toHaveLength(37);
      }
      if (day === "2026-06-20") {
        expect(
          transactions.filter(({ description }) =>
            description.endsWith("withdrawal"),
          ),
        ).toHaveLength(4);
      }
    },
  );
});
