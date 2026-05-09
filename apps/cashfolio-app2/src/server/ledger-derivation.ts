import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import { moneyAdd, toMoney, toMoneyNumber } from "../shared/money";

export type LedgerDerivedAccount = {
  type: AccountType;
  equityAccountSubtype: EquityAccountSubtype | null;
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
};

export type LedgerDerivedBooking = {
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

export type LedgerDerivedRow = {
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

export type LedgerBalanceChartPoint = {
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
