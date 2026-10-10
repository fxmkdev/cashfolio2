import Decimal from "decimal.js";
import { describe, expect, it, vi } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import { getOpeningBalancesBookingDate } from "../shared/date";
import { validateGainLossSimpleTransactionInvariant } from "../shared/gain-loss-transaction-invariant";
import { readStatementImportCsvFormat } from "../shared/statement-import-csv-format";
import {
  GAIN_LOSS_ACCOUNT_KEY,
  generateStagingDataset,
  generateStatementImportSample,
  getZurichToday,
  type SeedBooking,
} from "./dataset";

const today = new Date("2026-10-10T00:00:00.000Z");
const dataset = generateStagingDataset(today);
const household = dataset.books[0];
const allBookings = (book = household) =>
  book.transactions.flatMap((transaction) => transaction.bookings);
const accountBalance = (key: string) =>
  Decimal.sum(
    0,
    ...allBookings()
      .filter((booking) => booking.accountKey === key)
      .map((booking) => booking.value),
  );
const unitKey = (booking: SeedBooking) =>
  [
    booking.unit,
    booking.currency,
    booking.cryptocurrency,
    booking.symbol,
    booking.tradeCurrency,
  ].join(":");

describe("staging synthetic dataset", () => {
  it("is deterministic, gives all books CHF references, and retains an empty book", () => {
    expect(generateStagingDataset(today)).toEqual(dataset);
    expect(today.toISOString()).toBe("2026-10-10T00:00:00.000Z");
    expect(dataset.books.map((book) => book.key)).toEqual([
      "household",
      "edge-cases",
      "empty",
    ]);
    for (const book of dataset.books) {
      expect(book.referenceCurrency).toBe("CHF");
      expect(book.startDate.toISOString()).toBe("2023-10-10T00:00:00.000Z");
    }
    expect(dataset.books[2].accounts).toEqual([]);
    expect(dataset.books[2].groups).toEqual([]);
    expect(dataset.books[2].transactions).toEqual([]);
  });

  it("covers every day, all month boundaries and today, with only opening balances before start", () => {
    const days = new Set(
      allBookings().map((booking) => booking.date.toISOString()),
    );
    const expectedDayCount =
      (today.getTime() - household.startDate.getTime()) / 86_400_000 + 1;
    expect(days.size).toBe(expectedDayCount + 1);
    for (const book of dataset.books) {
      for (const transaction of book.transactions) {
        const opening = transaction.bookings.some(
          (booking) => booking.accountKey === "opening",
        );
        for (const booking of transaction.bookings) {
          expect(booking.date.toISOString().slice(11)).toBe("00:00:00.000Z");
          expect(booking.date.getTime()).toBeLessThanOrEqual(today.getTime());
          expect(booking.date.getTime()).toBeGreaterThanOrEqual(
            opening
              ? getOpeningBalancesBookingDate(book.startDate).getTime()
              : book.startDate.getTime(),
          );
          if (opening) {
            expect(booking.date).toEqual(
              getOpeningBalancesBookingDate(book.startDate),
            );
          }
        }
      }
    }
    expect(days.has(today.toISOString())).toBe(true);
    expect(days.has("2024-02-29T00:00:00.000Z")).toBe(true);
  });

  it("clamps the start anniversary for leap days and accepts early-month current days", () => {
    for (const [day, start] of [
      ["2024-02-29", "2021-02-28"],
      ["2026-01-01", "2023-01-01"],
      ["2026-03-01", "2023-03-01"],
    ]) {
      const generated = generateStagingDataset(
        new Date(`${day}T00:00:00.000Z`),
      );
      expect(generated.books[0].startDate.toISOString().slice(0, 10)).toBe(
        start,
      );
      const dates = allBookings(generated.books[0]).map((booking) =>
        booking.date.toISOString().slice(0, 10),
      );
      expect(dates).toContain(day);
      expect(dates.every((date) => date <= day)).toBe(true);
    }
  });

  it("resolves Zurich days across midnight and daylight-saving changes", () => {
    for (const [instant, day] of [
      ["2026-01-01T22:59:59Z", "2026-01-01"],
      ["2026-01-01T23:00:00Z", "2026-01-02"],
      ["2026-07-01T21:59:59Z", "2026-07-01"],
      ["2026-07-01T22:00:00Z", "2026-07-02"],
      ["2026-03-29T22:00:00Z", "2026-03-30"],
      ["2026-10-25T23:00:00Z", "2026-10-26"],
    ]) {
      expect(getZurichToday(new Date(instant)).toISOString()).toBe(
        `${day}T00:00:00.000Z`,
      );
    }
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-01T22:05:00Z"));
      expect(generateStagingDataset().today.toISOString()).toBe(
        "2026-07-02T00:00:00.000Z",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects invalid and time-bearing dates rather than moving the intended day", () => {
    for (const invalid of [new Date(NaN), new Date("2026-10-10T12:00:00Z")]) {
      expect(() => generateStagingDataset(invalid)).toThrow("UTC midnight");
    }
  });

  it("balances every same-unit transaction exactly and preserves opening unit quantities", () => {
    for (const book of dataset.books) {
      for (const transaction of book.transactions) {
        expect(transaction.bookings.length).toBeGreaterThanOrEqual(2);
        expect(
          transaction.bookings.map((booking) => booking.sortOrder),
        ).toEqual(transaction.bookings.map((_, index) => index));
        if (new Set(transaction.bookings.map(unitKey)).size === 1) {
          expect(
            Decimal.sum(
              ...transaction.bookings.map((booking) => booking.value),
            ).toString(),
          ).toBe("0");
        }
        for (const booking of transaction.bookings) {
          expect(new Decimal(booking.value).isFinite()).toBe(true);
        }
        if (
          transaction.bookings.some(
            (booking) => booking.accountKey === "opening",
          )
        ) {
          expect(new Set(transaction.bookings.map(unitKey)).size).toBe(1);
        }
      }
    }
  });

  it("uses valid logical links and metadata compatible with each account", () => {
    for (const book of dataset.books) {
      const accounts = new Map(
        book.accounts.map((account) => [account.key, account]),
      );
      const groups = new Map(book.groups.map((group) => [group.key, group]));
      expect(accounts.size).toBe(book.accounts.length);
      expect(groups.size).toBe(book.groups.length);
      expect(accounts.has(GAIN_LOSS_ACCOUNT_KEY)).toBe(false);
      for (const group of book.groups) {
        if (group.parentKey) expect(groups.has(group.parentKey)).toBe(true);
      }
      for (const account of book.accounts) {
        if (account.groupKey) expect(groups.has(account.groupKey)).toBe(true);
      }
      for (const booking of allBookings(book)) {
        if (booking.accountKey === GAIN_LOSS_ACCOUNT_KEY) continue;
        const account = accounts.get(booking.accountKey);
        expect(account).toBeDefined();
        if (!account!.unit) continue;
        for (const field of [
          "unit",
          "currency",
          "cryptocurrency",
          "symbol",
          "tradeCurrency",
        ] as const) {
          expect(booking[field]).toBe(account![field]);
        }
      }
    }
  });

  it("includes realistic balances, liabilities, cash-flow flags and safe archived accounts", () => {
    for (const account of household.accounts) {
      if (account.type === AccountType.ASSET) {
        expect(accountBalance(account.key).gte(0)).toBe(true);
      }
      if (account.type === AccountType.LIABILITY) {
        expect(accountBalance(account.key).lte(0)).toBe(true);
      }
      if (account.isCashAccount) {
        expect(account.type).toBe(AccountType.ASSET);
        expect(account.unit).toBe(Unit.CURRENCY);
      }
      if (!account.isActive)
        expect(accountBalance(account.key).toString()).toBe("0");
      const parent = household.groups.find(
        (group) => group.key === account.groupKey,
      );
      if (parent?.isCashAccount) expect(account.isCashAccount).toBe(true);
    }
    expect(accountBalance("current").gt(1000)).toBe(true);
    expect(accountBalance("loan").lt(0)).toBe(true);
    expect(accountBalance("spare").toString()).toBe("0");
    expect(household.groups.some((group) => !group.isActive)).toBe(true);
    expect(
      household.accounts
        .filter((account) => !account.unit)
        .map((account) => account.key),
    ).toEqual(expect.arrayContaining(["opening", "travel", "interest"]));
  });

  it("keeps loan and credit card debt nonpositive and pays only outstanding card debt", () => {
    for (const key of ["loan", "card"]) {
      const changes = new Map<number, Decimal>();
      for (const booking of allBookings().filter(
        (booking) => booking.accountKey === key,
      )) {
        const day = booking.date.getTime();
        changes.set(
          day,
          (changes.get(day) ?? new Decimal(0)).plus(booking.value),
        );
      }
      let balance = new Decimal(0);
      for (const [, change] of [...changes].sort(
        ([left], [right]) => left - right,
      )) {
        balance = balance.plus(change);
        expect(balance.lte(0)).toBe(true);
      }
    }
    const cardBookings = allBookings().filter(
      (booking) => booking.accountKey === "card",
    );
    for (const transaction of household.transactions.filter(
      (transaction) =>
        transaction.description === "Credit card statement payment",
    )) {
      const day = transaction.bookings[0].date;
      expect(
        Decimal.sum(
          0,
          ...cardBookings
            .filter((booking) => booking.date <= day)
            .map((booking) => booking.value),
        ).toString(),
      ).toBe("0");
    }
  });

  it("covers split editing, gain/loss reconciliation, all unit types and hierarchy drilldowns", () => {
    expect(
      household.transactions.some(
        (transaction) => transaction.bookings.length === 3,
      ),
    ).toBe(true);
    expect(new Set(allBookings().map((booking) => booking.unit))).toEqual(
      new Set([Unit.CURRENCY, Unit.SECURITY, Unit.CRYPTOCURRENCY]),
    );
    expect(
      new Set(
        allBookings().flatMap((booking) =>
          booking.currency ? [booking.currency] : [],
        ),
      ),
    ).toEqual(new Set(["CHF", "EUR", "USD"]));
    for (const key of ["aapl", "msft", "btc", "eth"]) {
      expect(
        allBookings().some(
          (booking) =>
            booking.accountKey === key && new Decimal(booking.value).gt(0),
        ),
      ).toBe(true);
    }
    for (const key of ["aapl", "msft", "eth"]) {
      expect(
        allBookings().some(
          (booking) =>
            booking.accountKey === key && new Decimal(booking.value).lt(0),
        ),
      ).toBe(true);
    }
    const gainLoss = household.transactions.find((transaction) =>
      transaction.bookings.some(
        (booking) => booking.accountKey === GAIN_LOSS_ACCOUNT_KEY,
      ),
    )!;
    expect(
      validateGainLossSimpleTransactionInvariant(
        gainLoss.bookings.map((booking) =>
          booking.accountKey === GAIN_LOSS_ACCOUNT_KEY
            ? {
                type: AccountType.EQUITY,
                equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
              }
            : household.accounts.find(
                (account) => account.key === booking.accountKey,
              )!,
        ),
      ),
    ).toBeNull();
    expect(
      household.groups.find((group) => group.key === "securities")?.parentKey,
    ).toBe("investments");
    expect(
      household.groups.find((group) => group.key === "investments")?.parentKey,
    ).toBe("assets");
  });

  it("isolates missing valuation and crosses a month boundary without future bookings", () => {
    const edges = dataset.books[1];
    expect(
      household.accounts.every(
        (account) => account.symbol !== "CFDEMO_UNLISTED",
      ),
    ).toBe(true);
    expect(
      edges.accounts.some((account) => account.symbol === "CFDEMO_UNLISTED"),
    ).toBe(true);
    const transfer = edges.transactions.find((transaction) =>
      transaction.description.includes("next-day settlement"),
    )!;
    expect(
      transfer.bookings.map((booking) =>
        booking.date.toISOString().slice(0, 10),
      ),
    ).toEqual(["2026-09-30", "2026-10-01"]);
  });

  it("provides a matching import sample with signs, original currency and a refund", () => {
    const account = household.accounts.find(
      (account) => account.key === "current",
    )!;
    expect(
      readStatementImportCsvFormat(account.statementImportCsvFormat).errors,
    ).toEqual([]);
    expect(generateStatementImportSample(today)).toBe(
      [
        "date,amount,original amount,original currency,exchange rate,description",
        "2026-10-10,-54.60,,,,Demo statement groceries",
        "2026-10-10,-42.75,-45.00,EUR,0.95,Demo statement restaurant abroad",
        "2026-10-10,125.00,,,,Demo statement refund",
        "",
      ].join("\n"),
    );
  });
});
