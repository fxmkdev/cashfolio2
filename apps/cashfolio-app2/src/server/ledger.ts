import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../prisma.server";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import { getOpeningBalancesBookingDate, startOfUtcDay } from "../shared/date";
import {
  getExplicitPeriodDateRange,
  parseExplicitPeriodSelectionFromUnknown,
  type ExplicitPeriodSelection,
} from "../shared/period";
import { moneyAdd, toMoney, toMoneyNumber } from "../shared/money";
import { createGroupPathSegmentsResolver } from "./accounts-helpers";
import { convertBookingValueToReference } from "./period-conversion";

const LEDGER_REFERENCE_CONVERSION_CONCURRENCY = 12;

type LedgerDerivedAccount = {
  type: AccountType;
  equityAccountSubtype: EquityAccountSubtype | null;
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
};

type LedgerDerivedBooking = {
  id: string;
  date: Date;
  description: string | null;
  value: number;
  valueInReferenceCurrency: number | null;
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  transactionId: string;
  transactionDescription: string | null;
  counterpartyAccounts: { id: string; name: string }[];
  isOpeningBalancesTransaction: boolean;
};

type LedgerDerivedRow = {
  id: string;
  transactionId: string;
  bookingValue: number;
  date: string;
  counterpartyAccounts: { id: string; name: string }[];
  description: string;
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  isOpeningBalancesTransaction: boolean;
  debit: number | null;
  credit: number | null;
  referenceDebit: number | null;
  referenceCredit: number | null;
  balance: number | null;
  isVirtualCarryOver: boolean;
};

type LedgerBalanceChartPoint = {
  date: string;
  dateKey: string;
  dateLabel: string;
  balance: number;
};

type LedgerDerivationContext = {
  negate: boolean;
  isEquity: boolean;
  hasPeriodFilter: boolean;
  hasBookingsBeforePeriod: boolean;
};

function shouldNegate(
  type: AccountType,
  equityAccountSubtype: EquityAccountSubtype | null,
): boolean {
  return (
    type === AccountType.LIABILITY ||
    (type === AccountType.EQUITY &&
      equityAccountSubtype !== EquityAccountSubtype.EXPENSE)
  );
}

function formatUtcDateKey(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatUtcDateLabel(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  return `${day}.${month}.${year}`;
}

function toUtcMidnightIsoString(dateKey: string): string {
  return `${dateKey}T00:00:00.000Z`;
}

function buildLedgerRowsFromBookings(args: {
  account: LedgerDerivedAccount;
  bookings: LedgerDerivedBooking[];
  context: LedgerDerivationContext;
  baseBalanceBeforePeriod: ReturnType<typeof toMoney>;
}): LedgerDerivedRow[] {
  const { account, bookings, context, baseBalanceBeforePeriod } = args;
  const { negate, isEquity, hasPeriodFilter, hasBookingsBeforePeriod } =
    context;

  let runningBalance =
    hasPeriodFilter && !isEquity ? baseBalanceBeforePeriod : toMoney(0);
  let runningEquityReferenceBalance = toMoney(0);
  let equityReferenceBalanceHasGap = false;

  const rowsAscending = bookings.map((booking) => {
    const rawValue = toMoney(booking.value);
    const signedValue = negate ? rawValue.neg() : rawValue;
    runningBalance = moneyAdd(runningBalance, signedValue);

    const signedReferenceValue =
      booking.valueInReferenceCurrency == null
        ? null
        : negate
          ? toMoney(booking.valueInReferenceCurrency).neg()
          : toMoney(booking.valueInReferenceCurrency);

    if (isEquity && hasPeriodFilter) {
      if (signedReferenceValue == null) {
        equityReferenceBalanceHasGap = true;
      } else if (!equityReferenceBalanceHasGap) {
        runningEquityReferenceBalance = moneyAdd(
          runningEquityReferenceBalance,
          signedReferenceValue,
        );
      }
    }

    const valueSign = signedValue.comparedTo(0);
    const referenceSign = signedReferenceValue?.comparedTo(0) ?? 0;

    return {
      id: booking.id,
      transactionId: booking.transactionId,
      bookingValue: toMoneyNumber(rawValue),
      date: formatUtcDateLabel(booking.date),
      counterpartyAccounts: booking.counterpartyAccounts,
      description: booking.description || booking.transactionDescription || "",
      unit: booking.unit,
      currency: booking.currency,
      cryptocurrency: booking.cryptocurrency,
      symbol: booking.symbol,
      tradeCurrency: booking.tradeCurrency,
      isOpeningBalancesTransaction: booking.isOpeningBalancesTransaction,
      debit: negate
        ? valueSign < 0
          ? toMoneyNumber(signedValue.neg())
          : null
        : valueSign > 0
          ? toMoneyNumber(signedValue)
          : null,
      credit: negate
        ? valueSign > 0
          ? toMoneyNumber(signedValue)
          : null
        : valueSign < 0
          ? toMoneyNumber(signedValue.neg())
          : null,
      referenceDebit:
        signedReferenceValue == null
          ? null
          : negate
            ? referenceSign < 0
              ? toMoneyNumber(signedReferenceValue.neg())
              : null
            : referenceSign > 0
              ? toMoneyNumber(signedReferenceValue)
              : null,
      referenceCredit:
        signedReferenceValue == null
          ? null
          : negate
            ? referenceSign > 0
              ? toMoneyNumber(signedReferenceValue)
              : null
            : referenceSign < 0
              ? toMoneyNumber(signedReferenceValue.neg())
              : null,
      balance:
        isEquity && !hasPeriodFilter
          ? null
          : isEquity
            ? equityReferenceBalanceHasGap
              ? null
              : toMoneyNumber(runningEquityReferenceBalance)
            : toMoneyNumber(runningBalance),
      isVirtualCarryOver: false,
    } satisfies LedgerDerivedRow;
  });

  const rows: LedgerDerivedRow[] = [...rowsAscending].reverse();
  if (hasPeriodFilter && !isEquity && hasBookingsBeforePeriod) {
    rows.push({
      id: "virtual-carry-over",
      transactionId: "virtual-carry-over",
      bookingValue: 0,
      date: "",
      counterpartyAccounts: [],
      description: "Balance carried forward",
      unit: account.unit,
      currency: account.currency,
      cryptocurrency: account.cryptocurrency,
      symbol: account.symbol,
      tradeCurrency: account.tradeCurrency,
      isOpeningBalancesTransaction: false,
      debit: null,
      credit: null,
      referenceDebit: null,
      referenceCredit: null,
      balance: toMoneyNumber(baseBalanceBeforePeriod),
      isVirtualCarryOver: true,
    });
  }

  return rows;
}

function buildLedgerBalanceChartPointsFromBookings(args: {
  bookings: LedgerDerivedBooking[];
  negate: boolean;
  today: Date;
}): LedgerBalanceChartPoint[] {
  const { bookings, negate, today } = args;
  const balanceChartPoints: LedgerBalanceChartPoint[] = [];
  let chartBalance = toMoney(0);

  for (const booking of bookings) {
    const value = negate
      ? toMoney(booking.value).neg()
      : toMoney(booking.value);
    chartBalance = moneyAdd(chartBalance, value);

    const dateKey = formatUtcDateKey(booking.date);
    const dateLabel = formatUtcDateLabel(booking.date);
    const lastPoint = balanceChartPoints[balanceChartPoints.length - 1];
    const balanceValue = toMoneyNumber(chartBalance);

    if (lastPoint && lastPoint.dateKey === dateKey) {
      lastPoint.balance = balanceValue;
      continue;
    }

    balanceChartPoints.push({
      date: toUtcMidnightIsoString(dateKey),
      dateKey,
      dateLabel,
      balance: balanceValue,
    });
  }

  const lastPoint = balanceChartPoints[balanceChartPoints.length - 1];
  if (lastPoint) {
    const todayKey = formatUtcDateKey(today);
    if (lastPoint.dateKey < todayKey) {
      balanceChartPoints.push({
        date: toUtcMidnightIsoString(todayKey),
        dateKey: todayKey,
        dateLabel: formatUtcDateLabel(today),
        balance: lastPoint.balance,
      });
    }
  }

  return balanceChartPoints;
}

export function deriveLedgerPresentationData(args: {
  account: LedgerDerivedAccount;
  bookings: LedgerDerivedBooking[];
  hasPeriodFilter: boolean;
  balanceBeforePeriodRaw: number;
  hasBookingsBeforePeriod: boolean;
  today?: Date;
}): {
  rows: LedgerDerivedRow[];
  balanceChartPoints: LedgerBalanceChartPoint[];
} {
  const {
    account,
    bookings,
    hasPeriodFilter,
    balanceBeforePeriodRaw,
    hasBookingsBeforePeriod,
  } = args;
  const today = args.today ?? new Date();
  const context: LedgerDerivationContext = {
    negate: shouldNegate(account.type, account.equityAccountSubtype),
    isEquity: account.type === AccountType.EQUITY,
    hasPeriodFilter,
    hasBookingsBeforePeriod,
  };
  const baseBalanceBeforePeriod = context.negate
    ? toMoney(balanceBeforePeriodRaw).neg()
    : toMoney(balanceBeforePeriodRaw);

  const rows = buildLedgerRowsFromBookings({
    account,
    bookings,
    context,
    baseBalanceBeforePeriod,
  });
  const balanceChartPoints = buildLedgerBalanceChartPointsFromBookings({
    bookings,
    negate: context.negate,
    today,
  });

  return { rows, balanceChartPoints };
}

export const getAccountForLedger = createServerFn({ method: "GET" })
  .inputValidator((data: { accountId: string; accountBookId: string }) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const account = await prisma.account.findUniqueOrThrow({
      where: {
        id_accountBookId: {
          id: data.accountId,
          accountBookId: data.accountBookId,
        },
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        type: true,
        equityAccountSubtype: true,
        unit: true,
        currency: true,
        cryptocurrency: true,
        symbol: true,
        tradeCurrency: true,
        groupId: true,
      },
    });

    const allGroups = await prisma.accountGroup.findMany({
      where: { accountBookId: data.accountBookId },
      select: { id: true, name: true, parentGroupId: true },
    });
    const resolveGroupPathSegments = createGroupPathSegmentsResolver(allGroups);

    const { groupId, ...rest } = account;
    return {
      ...rest,
      groupPathSegments: groupId ? resolveGroupPathSegments(groupId) : [],
    };
  });

export const getLedgerData = createServerFn({ method: "GET" })
  .inputValidator(
    (data: {
      accountId: string;
      accountBookId: string;
      period?: unknown;
      includeReferenceValues?: unknown;
      includeFirstBookingDate?: unknown;
      accountType?: unknown;
      accountEquityAccountSubtype?: unknown;
      accountUnit?: unknown;
      accountCurrency?: unknown;
      accountCryptocurrency?: unknown;
      accountSymbol?: unknown;
      accountTradeCurrency?: unknown;
    }) => ({
      accountId: data.accountId,
      accountBookId: data.accountBookId,
      period: parseExplicitLedgerPeriodSelection(data.period),
      includeReferenceValues: toBoolean(data.includeReferenceValues),
      includeFirstBookingDate: toBoolean(data.includeFirstBookingDate),
      accountContext: parseLedgerAccountContextFromInput(data),
    }),
  )
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const periodRange = data.period
      ? getExplicitPeriodDateRange(data.period)
      : null;
    const accountPromise: Promise<LedgerDerivedAccount> = data.accountContext
      ? Promise.resolve({
          type: data.accountContext.type,
          equityAccountSubtype: data.accountContext.equityAccountSubtype,
          unit: data.accountContext.unit,
          currency: data.accountContext.currency,
          cryptocurrency: data.accountContext.cryptocurrency,
          symbol: data.accountContext.symbol,
          tradeCurrency: data.accountContext.tradeCurrency,
        })
      : prisma.account.findUniqueOrThrow({
          where: {
            id_accountBookId: {
              id: data.accountId,
              accountBookId: data.accountBookId,
            },
          },
          select: {
            type: true,
            equityAccountSubtype: true,
            unit: true,
            currency: true,
            cryptocurrency: true,
            symbol: true,
            tradeCurrency: true,
          },
        });
    const firstBookingPromise = data.includeFirstBookingDate
      ? prisma.booking.findFirst({
          where: {
            accountId: data.accountId,
            accountBookId: data.accountBookId,
          },
          orderBy: [{ date: "asc" }, { id: "asc" }],
          select: {
            date: true,
          },
        })
      : Promise.resolve<{
          date: Date;
        } | null>(null);
    const carryOverMetadataPromise = periodRange
      ? prisma.booking
          .aggregate({
            where: {
              accountId: data.accountId,
              accountBookId: data.accountBookId,
              date: { lt: periodRange.from },
            },
            _sum: { value: true },
            _count: { _all: true },
          })
          .then((aggregateResult) => ({
            balanceBeforePeriod: toMoneyNumber(aggregateResult._sum.value ?? 0),
            hasBookingsBeforePeriod: aggregateResult._count._all > 0,
          }))
      : Promise.resolve({
          balanceBeforePeriod: 0,
          hasBookingsBeforePeriod: false,
        });

    const [
      account,
      bookings,
      referenceCurrency,
      carryOverMetadata,
      firstBooking,
    ] = await Promise.all([
      accountPromise,
      prisma.booking.findMany({
        where: {
          accountId: data.accountId,
          accountBookId: data.accountBookId,
          ...(periodRange
            ? {
                date: {
                  gte: periodRange.from,
                  lt: periodRange.toExclusive,
                },
              }
            : {}),
        },
        orderBy: [
          { date: "asc" },
          { transaction: { createdAt: "asc" } },
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
          transaction: {
            select: {
              description: true,
              bookings: {
                orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
                select: {
                  account: {
                    select: {
                      id: true,
                      name: true,
                      type: true,
                      equityAccountSubtype: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      data.includeReferenceValues
        ? prisma.accountBook
            .findUniqueOrThrow({
              where: { id: data.accountBookId },
              select: { referenceCurrency: true },
            })
            .then((accountBook) => accountBook.referenceCurrency.toUpperCase())
        : Promise.resolve<string | null>(null),
      carryOverMetadataPromise,
      firstBookingPromise,
    ]);

    let convertedValuesInReferenceCurrency: Array<number | null> | null = null;
    if (data.includeReferenceValues && referenceCurrency) {
      const exchangeRateByKey = new Map<string, Promise<number | null>>();
      convertedValuesInReferenceCurrency = await mapWithConcurrencyLimit(
        bookings,
        LEDGER_REFERENCE_CONVERSION_CONCURRENCY,
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
    }

    type LedgerBookingRecord = (typeof bookings)[number];
    const mapLedgerBooking = (
      booking: LedgerBookingRecord,
      valueInReferenceCurrency: number | null,
    ) => ({
      id: booking.id,
      date: booking.date,
      description: booking.description,
      value: toMoneyNumber(booking.value),
      valueInReferenceCurrency,
      unit: booking.unit,
      currency: booking.currency,
      cryptocurrency: booking.cryptocurrency,
      symbol: booking.symbol,
      tradeCurrency: booking.tradeCurrency,
      transactionId: booking.transactionId,
      transactionDescription: booking.transaction.description,
      counterpartyAccounts: [
        ...new Map(
          booking.transaction.bookings
            .filter((sb) => sb.account.id !== data.accountId)
            .map((sb) => [
              sb.account.id,
              { id: sb.account.id, name: sb.account.name },
            ]),
        ).values(),
      ],
      isOpeningBalancesTransaction: booking.transaction.bookings.some(
        (sb) =>
          sb.account.type === AccountType.EQUITY &&
          sb.account.equityAccountSubtype ===
            EquityAccountSubtype.OPENING_BALANCES,
      ),
    });

    const mappedBookings = bookings.map((booking, index) =>
      mapLedgerBooking(
        booking,
        convertedValuesInReferenceCurrency?.[index] ?? null,
      ),
    );

    const { rows, balanceChartPoints } = deriveLedgerPresentationData({
      account,
      bookings: mappedBookings,
      hasPeriodFilter: periodRange !== null,
      balanceBeforePeriodRaw: carryOverMetadata.balanceBeforePeriod,
      hasBookingsBeforePeriod: carryOverMetadata.hasBookingsBeforePeriod,
    });

    return {
      referenceCurrency,
      rows,
      balanceChartPoints,
      firstBookingDate: firstBooking?.date.toISOString() ?? null,
      balanceBeforePeriod: carryOverMetadata.balanceBeforePeriod,
      hasBookingsBeforePeriod: carryOverMetadata.hasBookingsBeforePeriod,
    };
  });

export const getLedgerPeriodBounds = createServerFn({ method: "GET" })
  .inputValidator((data: { accountBookId: string }) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const accountBook = await prisma.accountBook.findUniqueOrThrow({
      where: { id: data.accountBookId },
      select: { startDate: true },
    });
    const currentDay = startOfUtcDay(new Date());
    const accountBookStartDate = startOfUtcDay(accountBook.startDate);
    const openingBalancesBookingDate =
      getOpeningBalancesBookingDate(accountBookStartDate);

    return {
      minBookingDate: accountBookStartDate.toISOString(),
      maxDate: currentDay.toISOString(),
      openingBalancesBookingDate: openingBalancesBookingDate.toISOString(),
    };
  });

function parseExplicitLedgerPeriodSelection(
  value: unknown,
): ExplicitPeriodSelection | undefined {
  return parseExplicitPeriodSelectionFromUnknown(value);
}

function toBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

function parseLedgerAccountContextFromInput(data: {
  accountType?: unknown;
  accountEquityAccountSubtype?: unknown;
  accountUnit?: unknown;
  accountCurrency?: unknown;
  accountCryptocurrency?: unknown;
  accountSymbol?: unknown;
  accountTradeCurrency?: unknown;
}): LedgerDerivedAccount | null {
  const type = parseEnumValue(AccountType, data.accountType);
  if (!type) {
    return null;
  }

  const equityAccountSubtype = parseNullableEnumValue(
    EquityAccountSubtype,
    data.accountEquityAccountSubtype,
  );
  const unit = parseNullableEnumValue(Unit, data.accountUnit);
  const currency = parseNullableString(data.accountCurrency);
  const cryptocurrency = parseNullableString(data.accountCryptocurrency);
  const symbol = parseNullableString(data.accountSymbol);
  const tradeCurrency = parseNullableString(data.accountTradeCurrency);

  if (
    equityAccountSubtype === undefined ||
    unit === undefined ||
    currency === undefined ||
    cryptocurrency === undefined ||
    symbol === undefined ||
    tradeCurrency === undefined
  ) {
    return null;
  }

  return {
    type,
    equityAccountSubtype,
    unit,
    currency,
    cryptocurrency,
    symbol,
    tradeCurrency,
  };
}

function parseEnumValue<T extends string>(
  enumObject: Record<string, T>,
  value: unknown,
): T | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return Object.values(enumObject).includes(value as T)
    ? (value as T)
    : undefined;
}

function parseNullableEnumValue<T extends string>(
  enumObject: Record<string, T>,
  value: unknown,
): T | null | undefined {
  if (value == null) {
    return null;
  }
  return parseEnumValue(enumObject, value);
}

function parseNullableString(value: unknown): string | null | undefined {
  if (value == null) {
    return null;
  }
  return typeof value === "string" ? value : undefined;
}

async function mapWithConcurrencyLimit<TInput, TOutput>(
  items: readonly TInput[],
  concurrencyLimit: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<TOutput>(items.length);
  const workerCount = Math.min(Math.max(1, concurrencyLimit), items.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    }),
  );

  return results;
}
