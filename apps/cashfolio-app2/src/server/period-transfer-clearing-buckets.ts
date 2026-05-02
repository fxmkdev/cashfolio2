import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import { prisma } from "../prisma.server";
import { moneyAdd, toMoneyNumber } from "../shared/money";
import {
  TRANSFER_CLEARING_BOOKINGS_PAGE_SIZE,
  type TransferClearingBooking,
  type TransferClearingUnitBucket,
} from "./period-transfer-clearing-types";

function toTransferClearingUnitDescriptor(args: {
  booking: TransferClearingBooking;
  referenceCurrency: string;
}): Omit<TransferClearingUnitBucket, "rawBalance" | "bookings"> | null {
  if (args.booking.unit === Unit.CURRENCY) {
    if (!args.booking.currency) {
      return null;
    }
    const normalizedCurrency = args.booking.currency.toUpperCase();
    return {
      unitKey: `currency:${normalizedCurrency}`,
      unitLabel: normalizedCurrency,
      unitType: "currency",
      unit: Unit.CURRENCY,
      currency: normalizedCurrency,
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      isNonReferenceUnit: normalizedCurrency !== args.referenceCurrency,
    };
  }

  if (args.booking.unit === Unit.SECURITY) {
    if (!args.booking.symbol || !args.booking.tradeCurrency) {
      return null;
    }
    const normalizedSymbol = args.booking.symbol.toUpperCase();
    const normalizedTradeCurrency = args.booking.tradeCurrency.toUpperCase();
    return {
      unitKey: `security:${normalizedSymbol}:${normalizedTradeCurrency}`,
      unitLabel: `${normalizedSymbol}:${normalizedTradeCurrency}`,
      unitType: "security",
      unit: Unit.SECURITY,
      currency: null,
      cryptocurrency: null,
      symbol: normalizedSymbol,
      tradeCurrency: normalizedTradeCurrency,
      isNonReferenceUnit: true,
    };
  }

  if (!args.booking.cryptocurrency) {
    return null;
  }

  const normalizedCryptocurrency = args.booking.cryptocurrency.toUpperCase();
  return {
    unitKey: `crypto:${normalizedCryptocurrency}`,
    unitLabel: normalizedCryptocurrency,
    unitType: "cryptocurrency",
    unit: Unit.CRYPTOCURRENCY,
    currency: null,
    cryptocurrency: normalizedCryptocurrency,
    symbol: null,
    tradeCurrency: null,
    isNonReferenceUnit: true,
  };
}

async function loadTransferClearingBookings(args: {
  accountBookId: string;
  periodEndExclusive: Date;
}): Promise<TransferClearingBooking[]> {
  const results: TransferClearingBooking[] = [];
  let nextBookingIdCursor: string | undefined;

  while (true) {
    const bookingsPage = await prisma.booking.findMany({
      where: {
        accountBookId: args.accountBookId,
        date: { lt: args.periodEndExclusive },
        account: {
          OR: [
            {
              type: {
                in: [AccountType.ASSET, AccountType.LIABILITY],
              },
            },
            {
              type: AccountType.EQUITY,
              equityAccountSubtype: {
                in: [EquityAccountSubtype.INCOME, EquityAccountSubtype.EXPENSE],
              },
            },
          ],
        },
        transaction: {
          bookings: {
            some: {
              date: {
                gte: args.periodEndExclusive,
              },
            },
          },
        },
      },
      orderBy: { id: "asc" },
      take: TRANSFER_CLEARING_BOOKINGS_PAGE_SIZE,
      ...(nextBookingIdCursor
        ? {
            cursor: {
              id_accountBookId: {
                id: nextBookingIdCursor,
                accountBookId: args.accountBookId,
              },
            },
            skip: 1,
          }
        : {}),
      select: {
        id: true,
        description: true,
        transactionId: true,
        transaction: {
          select: {
            description: true,
          },
        },
        date: true,
        value: true,
        unit: true,
        currency: true,
        cryptocurrency: true,
        symbol: true,
        tradeCurrency: true,
      },
    });

    if (bookingsPage.length === 0) {
      break;
    }

    for (const booking of bookingsPage) {
      results.push({
        id: booking.id,
        description: booking.description,
        transactionDescription: booking.transaction?.description ?? null,
        transactionId: booking.transactionId,
        date: booking.date,
        value: toMoneyNumber(booking.value),
        unit: booking.unit,
        currency: booking.currency,
        cryptocurrency: booking.cryptocurrency,
        symbol: booking.symbol,
        tradeCurrency: booking.tradeCurrency,
      });
    }

    nextBookingIdCursor = bookingsPage[bookingsPage.length - 1].id;
    if (bookingsPage.length < TRANSFER_CLEARING_BOOKINGS_PAGE_SIZE) {
      break;
    }
  }

  return results;
}

function aggregateTransferClearingUnitBuckets(args: {
  bookings: TransferClearingBooking[];
  referenceCurrency: string;
}): TransferClearingUnitBucket[] {
  const unitBucketByKey = new Map<string, TransferClearingUnitBucket>();

  for (const booking of args.bookings) {
    const descriptor = toTransferClearingUnitDescriptor({
      booking,
      referenceCurrency: args.referenceCurrency,
    });
    if (!descriptor) {
      continue;
    }

    const existing = unitBucketByKey.get(descriptor.unitKey);
    if (existing) {
      existing.rawBalance = toMoneyNumber(
        moneyAdd(existing.rawBalance, booking.value),
      );
      existing.bookings.push(booking);
      continue;
    }

    unitBucketByKey.set(descriptor.unitKey, {
      ...descriptor,
      rawBalance: booking.value,
      bookings: [booking],
    });
  }

  return Array.from(unitBucketByKey.values()).sort(
    (left, right) =>
      left.unitLabel.localeCompare(right.unitLabel, "en") ||
      left.unitKey.localeCompare(right.unitKey, "en"),
  );
}

export async function loadTransferClearingUnitBuckets(args: {
  accountBookId: string;
  periodEndExclusive: Date;
  referenceCurrency: string;
}) {
  const bookings = await loadTransferClearingBookings({
    accountBookId: args.accountBookId,
    periodEndExclusive: args.periodEndExclusive,
  });

  return aggregateTransferClearingUnitBuckets({
    bookings,
    referenceCurrency: args.referenceCurrency,
  });
}
