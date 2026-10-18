import { AccountType } from "../../.prisma-client/enums";
import { prisma } from "../../prisma.server";
import { toMoney } from "../../shared/money";
import { addUtcDays, startOfUtcDay } from "../../shared/date";
import {
  getExplicitPeriodDateRange,
  parseExplicitPeriodSelection,
} from "../../shared/period";
import { EMPTY_GAIN_LOSS_SUMMARY } from "../../shared/account-gain-loss";
import { filterConvertibleHoldingAccounts } from "../period/period-helpers";
import {
  convertBookingValueToReferenceDetails,
  getUnitToReferenceExchangeRateDetails,
} from "../period/period-conversion";
import { loadPeriodHoldingTransactionsRaw } from "../period/base-data/period-base-data-holding-transactions.server";
import type { PeriodReadClient } from "../period/base-data/period-read-client";
import type {
  DecimalValuationRateLookupResult,
  ValuationRateSource,
} from "../valuation/types";
import { createValuationLookupContext } from "../valuation/lookup-context";
import {
  calculateAccountGainLoss,
  type AccountGainLossBasis,
} from "./account-gain-loss-calculation.server";

export function resolveAccountGainLossDate(period?: string, now = new Date()) {
  const today = startOfUtcDay(now);
  if (!period) return today;
  const selection = parseExplicitPeriodSelection(period);
  if (!selection) throw new Error("Invalid account G/L period");
  const periodEnd = addUtcDays(
    getExplicitPeriodDateRange(selection).toExclusive,
    -1,
  );
  return periodEnd < today ? periodEnd : today;
}

async function loadAccountGainLossInputs(
  args: { accountBookId: string; asOfDate: Date },
  db: PeriodReadClient,
) {
  const [book, accounts, groups] = await Promise.all([
    db.accountBook.findUniqueOrThrow({
      where: { id: args.accountBookId },
      select: {
        startDate: true,
        referenceCurrency: true,
        periodCacheRevision: true,
      },
    }),
    db.account.findMany({
      where: {
        accountBookId: args.accountBookId,
        type: { in: [AccountType.ASSET, AccountType.LIABILITY] },
      },
      select: {
        id: true,
        name: true,
        type: true,
        groupId: true,
        isActive: true,
        unit: true,
        currency: true,
        cryptocurrency: true,
        symbol: true,
        tradeCurrency: true,
      },
    }),
    db.accountGroup.findMany({
      where: { accountBookId: args.accountBookId },
      select: { id: true, parentGroupId: true, type: true },
    }),
  ]);
  const startDate = startOfUtcDay(book.startDate);
  const { asOfDate } = args;
  const referenceCurrency = book.referenceCurrency.toUpperCase();
  const holdingAccounts = filterConvertibleHoldingAccounts(
    accounts,
    referenceCurrency,
  );
  const holdingIds = holdingAccounts.map((account) => account.id);
  const [initialBalances, transactions, pendingBookings] = await Promise.all([
    db.booking.groupBy({
      by: ["accountId"],
      where: {
        accountBookId: args.accountBookId,
        accountId: { in: holdingIds },
        date: { lt: startDate },
      },
      _sum: { value: true },
    }),
    asOfDate < startDate
      ? Promise.resolve([])
      : loadPeriodHoldingTransactionsRaw(
          {
            accountBookId: args.accountBookId,
            holdingAccountIds: holdingIds,
            queryStart: startDate,
            queryEndExclusive: addUtcDays(asOfDate, 1),
          },
          db,
        ),
    db.booking.findMany({
      where: {
        accountBookId: args.accountBookId,
        accountId: { in: holdingIds },
        date: { gte: startDate, lt: addUtcDays(asOfDate, 1) },
        transaction: {
          bookings: { some: { date: { gte: addUtcDays(asOfDate, 1) } } },
        },
      },
      select: { accountId: true },
    }),
  ]);
  return {
    revision: book.periodCacheRevision,
    accounts,
    groups,
    startDate,
    asOfDate,
    referenceCurrency,
    holdingAccounts,
    initialBalances,
    transactions,
    pendingBookings,
  };
}

export type AccountGainLossBasisRange = Pick<
  Awaited<ReturnType<typeof loadAccountGainLossInputs>>,
  "revision" | "accounts" | "groups" | "startDate" | "referenceCurrency"
> & {
  watermark: string;
  basis: AccountGainLossBasis;
};

export async function loadAccountGainLossRange(args: {
  accountBookId: string;
  asOfDate: Date;
  detailAccountId?: string;
  onBasis?: (
    range: AccountGainLossBasisRange,
    cacheable: boolean,
  ) => Promise<void>;
}) {
  const {
    watermark,
    revision,
    accounts,
    groups,
    startDate,
    asOfDate,
    referenceCurrency,
    holdingAccounts,
    initialBalances,
    transactions,
    pendingBookings,
  } = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const inputs = await loadAccountGainLossInputs(args, tx);
      const lastBooking = args.onBasis
        ? await tx.booking.findFirst({
            where: {
              accountBookId: args.accountBookId,
              date: { lt: addUtcDays(args.asOfDate, 1) },
            },
            orderBy: { date: "desc" },
            select: { date: true },
          })
        : null;
      return {
        ...inputs,
        watermark: lastBooking?.date.toISOString() ?? "empty",
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 30_000 },
  );
  const exchangeRateByKey = new Map<
    string,
    Promise<DecimalValuationRateLookupResult>
  >();
  const latestFetchableDate =
    createValuationLookupContext().latestFetchableDate;
  let basisPhase = true;
  let cacheableBasis = true;
  let cacheableFromPermanentValuationCache = true;
  const markSource = (source: ValuationRateSource, date: Date) => {
    const permanent = source === "identity" || source === "timeSeries";
    if (!permanent) cacheableFromPermanentValuationCache = false;
    if (
      basisPhase &&
      (!permanent || (source !== "identity" && date > latestFetchableDate))
    )
      cacheableBasis = false;
  };
  const calculated = await calculateAccountGainLoss({
    holdingAccounts,
    unavailableHoldings: pendingBookings.map((booking) => booking.accountId),
    initialBalanceByAccountId:
      asOfDate < startDate
        ? new Map()
        : new Map(
            initialBalances.map((row) => [
              row.accountId,
              toMoney(row._sum.value ?? 0),
            ]),
          ),
    transactions,
    periodStart: startDate,
    periodEndExclusive: addUtcDays(asOfDate, 1),
    initialRateDate: addUtcDays(startDate, -1),
    periodEnd: asOfDate,
    detailAccountId: args.detailAccountId,
    onBasis: async (basis) => {
      await args.onBasis?.(
        {
          revision,
          accounts,
          groups,
          startDate,
          referenceCurrency,
          watermark,
          basis,
        },
        cacheableBasis && asOfDate >= startDate,
      );
      basisPhase = false;
    },
    resolveRate: async (input) => {
      const result = await getUnitToReferenceExchangeRateDetails({
        ...input,
        referenceCurrency,
        exchangeRateByKey,
      });
      markSource(result.source, input.date);
      return result.rate;
    },
    convertBookingToReference: async (booking) => {
      const result = await convertBookingValueToReferenceDetails({
        ...booking,
        referenceCurrency,
        exchangeRateByKey,
      });
      markSource(result.source, booking.date);
      return result.value;
    },
  });
  return finishAccountGainLossRange({
    calculated,
    revision,
    accounts,
    groups,
    referenceCurrency,
    startDate,
    asOfDate,
    cacheableFromPermanentValuationCache,
  });
}

export function finishAccountGainLossRange(
  args: Omit<AccountGainLossBasisRange, "basis" | "watermark"> & {
    calculated: Awaited<ReturnType<typeof calculateAccountGainLoss>>;
    asOfDate: Date;
    cacheableFromPermanentValuationCache: boolean;
  },
) {
  const {
    calculated,
    revision,
    accounts,
    groups,
    referenceCurrency,
    startDate,
    asOfDate,
    cacheableFromPermanentValuationCache,
  } = args;
  for (const account of accounts) {
    if (calculated.results.has(account.id)) continue;
    const applicable = !(
      account.unit === "CURRENCY" &&
      account.currency?.toUpperCase() === referenceCurrency
    );
    calculated.results.set(account.id, {
      applicable,
      summary: { ...EMPTY_GAIN_LOSS_SUMMARY },
      diagnostics: applicable
        ? [
            {
              date: asOfDate.toISOString(),
              message: "Account unit metadata is incomplete.",
            },
          ]
        : [],
    });
  }
  return {
    ...calculated,
    revision,
    cacheableFromPermanentValuationCache,
    accounts,
    groups,
    referenceCurrency,
    startDate: startDate.toISOString(),
    asOfDate: asOfDate.toISOString(),
  };
}
