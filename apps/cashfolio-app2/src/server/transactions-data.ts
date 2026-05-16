import { createServerFn } from "@tanstack/react-start";
import { AccountType, EquityAccountSubtype } from "../.prisma-client/enums";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import { prisma } from "../prisma.server";
import {
  formatMonthPeriodValue,
  getExplicitPeriodDateRange,
  parseExplicitPeriodSelectionFromUnknown,
  type ExplicitPeriodSelection,
} from "../shared/period";
import { toMoneyNumber } from "../shared/money";
import { mapWithConcurrencyLimit } from "./concurrency";
import { convertBookingValueToReference } from "./period/period-conversion";
import { deriveTransactionsRows } from "./transactions-data-derivation";

const TRANSACTIONS_REFERENCE_CONVERSION_CONCURRENCY = 12;

export const getTransactionsData = createServerFn({ method: "GET" })
  .inputValidator((data: { accountBookId: string; period?: unknown }) => ({
    accountBookId: data.accountBookId,
    period:
      parseExplicitTransactionsPeriodSelection(data.period) ??
      getDefaultTransactionsPeriodSelection(),
  }))
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const periodRange = getExplicitPeriodDateRange(data.period);

    const [bookings, openingBalanceTransactionIds, referenceCurrency] =
      await Promise.all([
        prisma.booking.findMany({
          where: {
            accountBookId: data.accountBookId,
            date: {
              gte: periodRange.from,
              lt: periodRange.toExclusive,
            },
          },
          orderBy: [
            { date: "desc" },
            { transaction: { createdAt: "desc" } },
            { sortOrder: "asc" },
            { id: "asc" },
          ],
          select: {
            id: true,
            date: true,
            description: true,
            value: true,
            unit: true,
            currency: true,
            cryptocurrency: true,
            symbol: true,
            tradeCurrency: true,
            transactionId: true,
            account: {
              select: {
                id: true,
                name: true,
              },
            },
            transaction: {
              select: {
                description: true,
              },
            },
          },
        }),
        prisma.booking
          .findMany({
            where: {
              accountBookId: data.accountBookId,
              account: {
                type: AccountType.EQUITY,
                equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
              },
            },
            distinct: ["transactionId"],
            select: {
              transactionId: true,
            },
          })
          .then(
            (openingBalanceBookings) =>
              new Set(
                openingBalanceBookings.map((booking) => booking.transactionId),
              ),
          ),
        prisma.accountBook
          .findUniqueOrThrow({
            where: { id: data.accountBookId },
            select: { referenceCurrency: true },
          })
          .then((accountBook) => accountBook.referenceCurrency.toUpperCase()),
      ]);

    const exchangeRateByKey = new Map<string, Promise<number | null>>();
    const convertedValuesInReferenceCurrency = await mapWithConcurrencyLimit(
      bookings,
      TRANSACTIONS_REFERENCE_CONVERSION_CONCURRENCY,
      (booking) =>
        booking.unit
          ? convertBookingValueToReference({
              value: toMoneyNumber(booking.value),
              unit: booking.unit,
              currency: booking.currency,
              cryptocurrency: booking.cryptocurrency,
              symbol: booking.symbol,
              tradeCurrency: booking.tradeCurrency,
              date: booking.date,
              referenceCurrency,
              exchangeRateByKey,
            })
          : Promise.resolve<number | null>(null),
    );

    const mappedBookings = bookings.map((booking, index) => ({
      id: booking.id,
      date: booking.date,
      description: booking.description,
      value: toMoneyNumber(booking.value),
      valueInReferenceCurrency:
        convertedValuesInReferenceCurrency[index] ?? null,
      unit: booking.unit,
      currency: booking.currency,
      cryptocurrency: booking.cryptocurrency,
      symbol: booking.symbol,
      tradeCurrency: booking.tradeCurrency,
      transactionId: booking.transactionId,
      transactionDescription: booking.transaction.description,
      account: booking.account,
      isOpeningBalancesTransaction: openingBalanceTransactionIds.has(
        booking.transactionId,
      ),
    }));

    return {
      referenceCurrency,
      rows: deriveTransactionsRows({ bookings: mappedBookings }).rows,
    };
  });

function parseExplicitTransactionsPeriodSelection(
  value: unknown,
): ExplicitPeriodSelection | undefined {
  return parseExplicitPeriodSelectionFromUnknown(value);
}

function getDefaultTransactionsPeriodValue(date: Date = new Date()): string {
  return formatMonthPeriodValue(date.getUTCFullYear(), date.getUTCMonth());
}

function getDefaultTransactionsPeriodSelection(): ExplicitPeriodSelection {
  const selection = parseExplicitTransactionsPeriodSelection(
    getDefaultTransactionsPeriodValue(),
  );
  if (!selection) {
    throw new Error("Default transactions period is invalid.");
  }
  return selection;
}
