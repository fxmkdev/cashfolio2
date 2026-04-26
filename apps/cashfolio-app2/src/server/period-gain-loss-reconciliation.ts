import { createServerFn } from "@tanstack/react-start";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import { prisma } from "../prisma.server";
import { startOfUtcDay } from "../shared/date";
import { normalizePeriodValue } from "../shared/period";
import {
  applyHoldingTransactionsToGainLossState,
  finalizeHoldingGainLossState,
  initializeHoldingGainLossState,
  type HoldingGainLossSkippedReason,
} from "./period-overview-holdings";
import { filterConvertibleHoldingAccounts, round2 } from "./period-helpers";
import {
  convertBookingValueToReference,
  getUnitToReferenceExchangeRate,
} from "./period-conversion";
import {
  getPeriodEndExclusive,
  resolvePeriodSelection,
} from "./period-selection";
import {
  computeTransferClearingGainLossSplit,
  loadTransferClearingUnitBuckets,
  type TransferClearingUnitBucket,
} from "./period-transfer-clearing";
import { formatUnitLabel, normalizeUppercaseCode } from "./period-unit-format";

const RECONCILIATION_TRANSACTIONS_PAGE_SIZE = 200;
const VIRTUAL_TRANSFER_CLEARING_ACCOUNT_PREFIX =
  "virtual:transfer-clearing:account:";

type GainLossReconciliationDiagnosticReason =
  | HoldingGainLossSkippedReason
  | "missingTargetAccount";

type GainLossReconciliationDiagnostic = {
  reason: GainLossReconciliationDiagnosticReason;
  message: string;
  bookingId: string | null;
  bookingDescription: string | null;
  transactionId: string | null;
  transactionDescription: string | null;
  date: string;
};

type GainLossReconciliationRealizedEvent = {
  id: string;
  date: string;
  bookingId: string;
  bookingDescription: string | null;
  transactionId: string | null;
  transactionDescription: string | null;
  quantity: number;
  effectiveReferenceAmount: number;
  executionUnitPriceInReference: number;
  realizedGainLossDelta: number;
  runningRealizedGainLoss: number;
  lotMatches: GainLossReconciliationRealizedEventLotMatch[];
  pricing: {
    source: "directConversion" | "residualAdjusted" | "marketFallback";
    marketReferenceAmount: number;
    residualAllocationAmount: number;
    effectiveReferenceAmount: number;
  };
  rounding: {
    rawEffectiveReferenceAmount: number;
    roundedEffectiveReferenceAmount: number;
    rawExecutionUnitPriceInReference: number;
    roundedExecutionUnitPriceInReference: number;
    rawRealizedGainLossDelta: number;
    roundedRealizedGainLossDelta: number;
    rawRunningRealizedGainLoss: number;
    roundedRunningRealizedGainLoss: number;
  };
};

type GainLossReconciliationOpenLot = {
  id: string;
  acquisitionSortKey: string;
  acquisitionDate: string;
  acquisitionBookingId: string;
  quantity: number;
  unitCostInReference: number;
  periodEndRate: number;
  unrealizedGainLoss: number;
  runningUnrealizedGainLoss: number;
};

type GainLossReconciliationRealizedEventLotMatch = {
  id: string;
  acquisitionSortKey: string;
  acquisitionDate: string;
  acquisitionBookingId: string;
  matchedQuantity: number;
  lotUnitCostInReference: number;
  executionUnitPriceInReference: number;
  realizedGainLossDelta: number;
  runningRealizedGainLoss: number;
};

export type PeriodGainLossReconciliation = {
  target: {
    accountId: string;
    accountName: string;
    isVirtual: boolean;
    unit: Unit;
    unitLabel: string;
    currency: string | null;
    cryptocurrency: string | null;
    symbol: string | null;
    tradeCurrency: string | null;
  };
  referenceCurrency: string;
  selectedPeriodValue: string;
  selectedPeriodLabel: string;
  selectedPeriodSpecifier: string;
  selectedGranularity: "month" | "year";
  selectedYear: number;
  selectedMonth: number | null;
  periodBounds: {
    minBookingDate: string | null;
    maxDate: string;
  };
  periodDateRange: {
    from: string;
    to: string;
  };
  summary: {
    realizedGainLoss: number;
    unrealizedGainLoss: number;
    totalGainLoss: number;
  };
  realizedEvents: GainLossReconciliationRealizedEvent[];
  unrealizedOpenLots: GainLossReconciliationOpenLot[];
  diagnostics: {
    skippedCount: number;
    items: GainLossReconciliationDiagnostic[];
  };
};

function getDiagnosticMessage(
  reason: GainLossReconciliationDiagnosticReason,
): string {
  if (reason === "missingInitialRate") {
    return "Missing initial valuation rate for opening balance.";
  }
  if (reason === "missingConversion") {
    return "Missing booking conversion into reference currency.";
  }
  if (reason === "invalidExecutionPrice") {
    return "Execution price could not be derived from converted values.";
  }
  if (reason === "missingPeriodEndRate") {
    return "Missing period-end valuation rate for open lots.";
  }
  return "Selected target account could not be resolved.";
}

function pushDiagnostic(
  diagnostics: GainLossReconciliationDiagnostic[],
  args: {
    reason: GainLossReconciliationDiagnosticReason;
    date: Date;
    bookingId?: string;
    bookingDescription?: string | null;
    transactionId?: string | null;
    transactionDescription?: string | null;
  },
) {
  diagnostics.push({
    reason: args.reason,
    message: getDiagnosticMessage(args.reason),
    bookingId: args.bookingId ?? null,
    bookingDescription: args.bookingDescription ?? null,
    transactionId: args.transactionId ?? null,
    transactionDescription: args.transactionDescription ?? null,
    date: args.date.toISOString(),
  });
}

function parseAcquisitionSortKey(sortKey: string): {
  acquisitionDate: string;
  acquisitionBookingId: string;
} {
  const separatorIndex = sortKey.indexOf("::");
  if (separatorIndex < 0) {
    return {
      acquisitionDate: new Date(0).toISOString(),
      acquisitionBookingId: sortKey,
    };
  }

  const datePart = sortKey.slice(0, separatorIndex);
  const bookingId = sortKey.slice(separatorIndex + 2);
  const acquisitionDate = new Date(datePart);
  return {
    acquisitionDate: Number.isFinite(acquisitionDate.getTime())
      ? acquisitionDate.toISOString()
      : new Date(0).toISOString(),
    acquisitionBookingId: bookingId,
  };
}

function toRealizedEventLotMatches(args: {
  bookingId: string;
  lotMatches: Array<{
    acquisitionSortKey: string;
    matchedQuantity: number;
    lotUnitCostInReference: number;
    executionUnitPriceInReference: number;
    realizedGainLossDelta: number;
    runningRealizedGainLoss: number;
  }>;
}): GainLossReconciliationRealizedEventLotMatch[] {
  return args.lotMatches.map((lotMatch, index) => {
    const parsed = parseAcquisitionSortKey(lotMatch.acquisitionSortKey);
    return {
      id: `match:${args.bookingId}:${index + 1}`,
      acquisitionSortKey: lotMatch.acquisitionSortKey,
      acquisitionDate: parsed.acquisitionDate,
      acquisitionBookingId: parsed.acquisitionBookingId,
      matchedQuantity: round2(lotMatch.matchedQuantity),
      lotUnitCostInReference: round2(lotMatch.lotUnitCostInReference),
      executionUnitPriceInReference: round2(
        lotMatch.executionUnitPriceInReference,
      ),
      realizedGainLossDelta: round2(lotMatch.realizedGainLossDelta),
      runningRealizedGainLoss: round2(lotMatch.runningRealizedGainLoss),
    };
  });
}

function toVirtualTransferClearingAccountId(unitKey: string): string {
  return `${VIRTUAL_TRANSFER_CLEARING_ACCOUNT_PREFIX}${unitKey}`;
}

function findTargetVirtualUnitBucket(args: {
  accountId: string;
  unitBuckets: TransferClearingUnitBucket[];
}): TransferClearingUnitBucket | null {
  for (const unitBucket of args.unitBuckets) {
    if (
      toVirtualTransferClearingAccountId(unitBucket.unitKey) === args.accountId
    ) {
      return unitBucket;
    }
  }
  return null;
}

function toSummary(args: {
  realizedGainLoss: number;
  unrealizedGainLoss: number;
}) {
  const realizedGainLoss = round2(args.realizedGainLoss);
  const unrealizedGainLoss = round2(args.unrealizedGainLoss);
  return {
    realizedGainLoss,
    unrealizedGainLoss,
    totalGainLoss: round2(realizedGainLoss + unrealizedGainLoss),
  };
}

function toEmptySummary() {
  return {
    realizedGainLoss: 0,
    unrealizedGainLoss: 0,
    totalGainLoss: 0,
  };
}

function addRunningUnrealizedGainLoss(
  openLots: GainLossReconciliationOpenLot[],
): GainLossReconciliationOpenLot[] {
  const sortedOpenLots = [...openLots].sort((left, right) =>
    left.acquisitionSortKey.localeCompare(right.acquisitionSortKey, "en"),
  );
  let runningUnrealizedGainLoss = 0;

  return sortedOpenLots.map((openLot) => {
    runningUnrealizedGainLoss = round2(
      runningUnrealizedGainLoss + openLot.unrealizedGainLoss,
    );
    return {
      ...openLot,
      runningUnrealizedGainLoss,
    };
  });
}

async function buildRealAccountReconciliation(args: {
  accountBookId: string;
  accountId: string;
  queryStart: Date;
  queryEndExclusive: Date;
  initialHoldingDate: Date;
  periodEnd: Date;
  referenceCurrency: string;
  isBeforeAccountBookStart: boolean;
}) {
  const account = await prisma.account.findFirst({
    where: {
      accountBookId: args.accountBookId,
      id: args.accountId,
      type: {
        in: [AccountType.ASSET, AccountType.LIABILITY],
      },
    },
    select: {
      id: true,
      name: true,
      unit: true,
      currency: true,
      cryptocurrency: true,
      symbol: true,
      tradeCurrency: true,
    },
  });

  if (!account) {
    return null;
  }

  const [targetAccount] = filterConvertibleHoldingAccounts(
    [account],
    args.referenceCurrency,
  );
  if (!targetAccount) {
    return null;
  }

  const diagnostics: GainLossReconciliationDiagnostic[] = [];
  const realizedEvents: GainLossReconciliationRealizedEvent[] = [];
  const unrealizedOpenLots: GainLossReconciliationOpenLot[] = [];

  if (args.isBeforeAccountBookStart) {
    return {
      target: {
        accountId: targetAccount.id,
        accountName: account.name,
        isVirtual: false,
        unit: targetAccount.unit,
        unitLabel: formatUnitLabel(targetAccount),
        currency: normalizeUppercaseCode(targetAccount.currency),
        cryptocurrency: normalizeUppercaseCode(targetAccount.cryptocurrency),
        symbol: normalizeUppercaseCode(targetAccount.symbol),
        tradeCurrency: normalizeUppercaseCode(targetAccount.tradeCurrency),
      },
      summary: toEmptySummary(),
      skippedCount: 0,
      realizedEvents,
      unrealizedOpenLots,
      diagnostics,
    };
  }

  const initialHoldingBalances = await prisma.booking.groupBy({
    by: ["accountId"],
    where: {
      accountBookId: args.accountBookId,
      accountId: targetAccount.id,
      date: { lt: args.queryStart },
    },
    _sum: { value: true },
  });
  const initialHoldingBalanceByAccountId = new Map(
    initialHoldingBalances.map((balance) => [
      balance.accountId,
      Number(balance._sum.value ?? 0),
    ]),
  );

  const exchangeRateByKey = new Map<string, Promise<number | null>>();

  const state = await initializeHoldingGainLossState({
    holdingAccounts: [targetAccount],
    initialBalanceByAccountId: initialHoldingBalanceByAccountId,
    initialRateDate: args.initialHoldingDate,
    resolveRate: (input) =>
      getUnitToReferenceExchangeRate({
        ...input,
        referenceCurrency: args.referenceCurrency,
        exchangeRateByKey,
      }),
    onSkippedItem: (item) => {
      pushDiagnostic(diagnostics, item);
    },
  });

  let nextTransactionIdCursor: string | undefined;
  while (true) {
    const transactionsPage = await prisma.transaction.findMany({
      where: {
        accountBookId: args.accountBookId,
        AND: [
          {
            bookings: {
              some: {
                accountId: targetAccount.id,
                date: {
                  gte: args.queryStart,
                  lt: args.queryEndExclusive,
                },
              },
            },
          },
          {
            bookings: {
              none: {
                date: {
                  gte: args.queryEndExclusive,
                },
              },
            },
          },
          {
            bookings: {
              none: {
                account: {
                  type: AccountType.EQUITY,
                  equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
                },
              },
            },
          },
        ],
      },
      orderBy: { id: "asc" },
      take: RECONCILIATION_TRANSACTIONS_PAGE_SIZE,
      ...(nextTransactionIdCursor
        ? {
            cursor: {
              id_accountBookId: {
                id: nextTransactionIdCursor,
                accountBookId: args.accountBookId,
              },
            },
            skip: 1,
          }
        : {}),
      select: {
        id: true,
        description: true,
        bookings: {
          select: {
            id: true,
            description: true,
            accountId: true,
            date: true,
            value: true,
            unit: true,
            currency: true,
            cryptocurrency: true,
            symbol: true,
            tradeCurrency: true,
            account: {
              select: {
                type: true,
                equityAccountSubtype: true,
              },
            },
          },
          orderBy: [{ date: "asc" }, { id: "asc" }],
        },
      },
    });

    if (transactionsPage.length === 0) {
      break;
    }

    nextTransactionIdCursor = transactionsPage[transactionsPage.length - 1].id;

    await applyHoldingTransactionsToGainLossState({
      state,
      transactions: transactionsPage.map((transaction) => ({
        bookings: transaction.bookings.map((booking) => ({
          id: booking.id,
          description: booking.description,
          transactionDescription: transaction.description,
          transactionId: transaction.id,
          accountId: booking.accountId,
          date: booking.date,
          value: Number(booking.value),
          unit: booking.unit,
          currency: booking.currency,
          cryptocurrency: booking.cryptocurrency,
          symbol: booking.symbol,
          tradeCurrency: booking.tradeCurrency,
          accountType: booking.account.type,
          equityAccountSubtype: booking.account.equityAccountSubtype,
        })),
      })),
      periodStart: args.queryStart,
      periodEndExclusive: args.queryEndExclusive,
      convertBookingToReference: (booking) =>
        convertBookingValueToReference({
          ...booking,
          referenceCurrency: args.referenceCurrency,
          exchangeRateByKey,
        }),
      onSkippedItem: (item) => {
        pushDiagnostic(diagnostics, item);
      },
    });

    if (transactionsPage.length < RECONCILIATION_TRANSACTIONS_PAGE_SIZE) {
      break;
    }
  }

  const split = await finalizeHoldingGainLossState({
    state,
    periodEnd: args.periodEnd,
    resolveRate: (input) =>
      getUnitToReferenceExchangeRate({
        ...input,
        referenceCurrency: args.referenceCurrency,
        exchangeRateByKey,
      }),
    onAccountExecutionEvent: (event) => {
      const roundedEffectiveReferenceAmount = round2(
        event.effectiveReferenceAmount,
      );
      const roundedExecutionUnitPriceInReference = round2(
        event.executionUnitPriceInReference,
      );
      const roundedRealizedGainLossDelta = round2(event.realizedGainLossDelta);
      const roundedRunningRealizedGainLoss = round2(
        event.runningRealizedGainLoss,
      );
      realizedEvents.push({
        id: `event:${event.bookingId}`,
        date: event.date.toISOString(),
        bookingId: event.bookingId,
        bookingDescription: event.bookingDescription ?? null,
        transactionId: event.transactionId,
        transactionDescription: event.transactionDescription ?? null,
        quantity: event.quantity,
        effectiveReferenceAmount: roundedEffectiveReferenceAmount,
        executionUnitPriceInReference: roundedExecutionUnitPriceInReference,
        realizedGainLossDelta: roundedRealizedGainLossDelta,
        runningRealizedGainLoss: roundedRunningRealizedGainLoss,
        lotMatches: toRealizedEventLotMatches({
          bookingId: event.bookingId,
          lotMatches: event.lotMatches,
        }),
        pricing: {
          source: event.pricingSource,
          marketReferenceAmount: round2(event.marketReferenceAmount),
          residualAllocationAmount: round2(event.residualAllocationAmount),
          effectiveReferenceAmount: roundedEffectiveReferenceAmount,
        },
        rounding: {
          rawEffectiveReferenceAmount: event.effectiveReferenceAmount,
          roundedEffectiveReferenceAmount,
          rawExecutionUnitPriceInReference: event.executionUnitPriceInReference,
          roundedExecutionUnitPriceInReference,
          rawRealizedGainLossDelta: event.realizedGainLossDelta,
          roundedRealizedGainLossDelta,
          rawRunningRealizedGainLoss: event.runningRealizedGainLoss,
          roundedRunningRealizedGainLoss,
        },
      });
    },
    onAccountOpenLotValuation: (lot) => {
      const parsed = parseAcquisitionSortKey(lot.acquisitionSortKey);
      unrealizedOpenLots.push({
        id: `lot:${lot.acquisitionSortKey}`,
        acquisitionSortKey: lot.acquisitionSortKey,
        acquisitionDate: parsed.acquisitionDate,
        acquisitionBookingId: parsed.acquisitionBookingId,
        quantity: lot.quantity,
        unitCostInReference: round2(lot.unitCostInReference),
        periodEndRate: round2(lot.periodEndRate),
        unrealizedGainLoss: round2(lot.unrealizedGainLoss),
        runningUnrealizedGainLoss: 0,
      });
    },
    onSkippedItem: (item) => {
      pushDiagnostic(diagnostics, item);
    },
  });

  return {
    target: {
      accountId: targetAccount.id,
      accountName: account.name,
      isVirtual: false,
      unit: targetAccount.unit,
      unitLabel: formatUnitLabel(targetAccount),
      currency: normalizeUppercaseCode(targetAccount.currency),
      cryptocurrency: normalizeUppercaseCode(targetAccount.cryptocurrency),
      symbol: normalizeUppercaseCode(targetAccount.symbol),
      tradeCurrency: normalizeUppercaseCode(targetAccount.tradeCurrency),
    },
    summary: toSummary({
      realizedGainLoss: split.realizedGainLoss,
      unrealizedGainLoss: split.unrealizedGainLoss,
    }),
    skippedCount: split.skippedCount,
    realizedEvents,
    unrealizedOpenLots: addRunningUnrealizedGainLoss(unrealizedOpenLots),
    diagnostics,
  };
}

async function buildTransferClearingReconciliation(args: {
  accountBookId: string;
  accountId: string;
  queryStart: Date;
  queryEndExclusive: Date;
  initialHoldingDate: Date;
  periodEnd: Date;
  referenceCurrency: string;
  isBeforeAccountBookStart: boolean;
}) {
  const unitBuckets = await loadTransferClearingUnitBuckets({
    accountBookId: args.accountBookId,
    periodEndExclusive: args.queryEndExclusive,
    referenceCurrency: args.referenceCurrency,
  });
  const targetBucket = findTargetVirtualUnitBucket({
    accountId: args.accountId,
    unitBuckets,
  });
  if (!targetBucket || !targetBucket.isNonReferenceUnit) {
    return null;
  }

  const diagnostics: GainLossReconciliationDiagnostic[] = [];
  const realizedEvents: GainLossReconciliationRealizedEvent[] = [];
  const unrealizedOpenLots: GainLossReconciliationOpenLot[] = [];

  if (args.isBeforeAccountBookStart) {
    return {
      target: {
        accountId: args.accountId,
        accountName: targetBucket.unitLabel,
        isVirtual: true,
        unit: targetBucket.unit,
        unitLabel: formatUnitLabel(targetBucket),
        currency: normalizeUppercaseCode(targetBucket.currency),
        cryptocurrency: normalizeUppercaseCode(targetBucket.cryptocurrency),
        symbol: normalizeUppercaseCode(targetBucket.symbol),
        tradeCurrency: normalizeUppercaseCode(targetBucket.tradeCurrency),
      },
      summary: toEmptySummary(),
      skippedCount: 0,
      realizedEvents,
      unrealizedOpenLots,
      diagnostics,
    };
  }

  const exchangeRateByKey = new Map<string, Promise<number | null>>();
  const split = await computeTransferClearingGainLossSplit({
    unitBuckets: [targetBucket],
    periodStart: args.queryStart,
    periodEndExclusive: args.queryEndExclusive,
    initialRateDate: args.initialHoldingDate,
    periodEnd: args.periodEnd,
    resolveRate: (input) =>
      getUnitToReferenceExchangeRate({
        ...input,
        referenceCurrency: args.referenceCurrency,
        exchangeRateByKey,
      }),
    convertBookingToReference: (booking) =>
      convertBookingValueToReference({
        ...booking,
        referenceCurrency: args.referenceCurrency,
        exchangeRateByKey,
      }),
    onUnitExecutionEvent: (event) => {
      const roundedEffectiveReferenceAmount = round2(
        event.effectiveReferenceAmount,
      );
      const roundedExecutionUnitPriceInReference = round2(
        event.executionUnitPriceInReference,
      );
      const roundedRealizedGainLossDelta = round2(event.realizedGainLossDelta);
      const roundedRunningRealizedGainLoss = round2(
        event.runningRealizedGainLoss,
      );
      realizedEvents.push({
        id: `event:${event.bookingId}`,
        date: event.date.toISOString(),
        bookingId: event.bookingId,
        bookingDescription: event.bookingDescription ?? null,
        transactionId: event.transactionId,
        transactionDescription: event.transactionDescription ?? null,
        quantity: event.quantity,
        effectiveReferenceAmount: roundedEffectiveReferenceAmount,
        executionUnitPriceInReference: roundedExecutionUnitPriceInReference,
        realizedGainLossDelta: roundedRealizedGainLossDelta,
        runningRealizedGainLoss: roundedRunningRealizedGainLoss,
        lotMatches: toRealizedEventLotMatches({
          bookingId: event.bookingId,
          lotMatches: event.lotMatches,
        }),
        pricing: {
          source: event.pricingSource,
          marketReferenceAmount: round2(event.marketReferenceAmount),
          residualAllocationAmount: round2(event.residualAllocationAmount),
          effectiveReferenceAmount: roundedEffectiveReferenceAmount,
        },
        rounding: {
          rawEffectiveReferenceAmount: event.effectiveReferenceAmount,
          roundedEffectiveReferenceAmount,
          rawExecutionUnitPriceInReference: event.executionUnitPriceInReference,
          roundedExecutionUnitPriceInReference,
          rawRealizedGainLossDelta: event.realizedGainLossDelta,
          roundedRealizedGainLossDelta,
          rawRunningRealizedGainLoss: event.runningRealizedGainLoss,
          roundedRunningRealizedGainLoss,
        },
      });
    },
    onUnitOpenLotValuation: (lot) => {
      const parsed = parseAcquisitionSortKey(lot.acquisitionSortKey);
      unrealizedOpenLots.push({
        id: `lot:${lot.acquisitionSortKey}`,
        acquisitionSortKey: lot.acquisitionSortKey,
        acquisitionDate: parsed.acquisitionDate,
        acquisitionBookingId: parsed.acquisitionBookingId,
        quantity: lot.quantity,
        unitCostInReference: round2(lot.unitCostInReference),
        periodEndRate: round2(lot.periodEndRate),
        unrealizedGainLoss: round2(lot.unrealizedGainLoss),
        runningUnrealizedGainLoss: 0,
      });
    },
    onSkippedItem: (item) => {
      pushDiagnostic(diagnostics, {
        reason: item.reason,
        date: item.date,
        bookingId: item.bookingId,
        bookingDescription: item.bookingDescription,
        transactionId: item.transactionId,
        transactionDescription: item.transactionDescription,
      });
    },
  });

  return {
    target: {
      accountId: args.accountId,
      accountName: targetBucket.unitLabel,
      isVirtual: true,
      unit: targetBucket.unit,
      unitLabel: formatUnitLabel(targetBucket),
      currency: normalizeUppercaseCode(targetBucket.currency),
      cryptocurrency: normalizeUppercaseCode(targetBucket.cryptocurrency),
      symbol: normalizeUppercaseCode(targetBucket.symbol),
      tradeCurrency: normalizeUppercaseCode(targetBucket.tradeCurrency),
    },
    summary: toSummary({
      realizedGainLoss: split.realizedGainLoss,
      unrealizedGainLoss: split.unrealizedGainLoss,
    }),
    skippedCount: split.skippedCount,
    realizedEvents,
    unrealizedOpenLots: addRunningUnrealizedGainLoss(unrealizedOpenLots),
    diagnostics,
  };
}

export const getPeriodGainLossReconciliation = createServerFn({
  method: "GET",
})
  .inputValidator(
    (data: { accountBookId: string; accountId: string; period?: unknown }) => ({
      accountBookId: data.accountBookId,
      accountId: data.accountId,
      period: normalizePeriodValue(data.period),
    }),
  )
  .handler(async ({ data }): Promise<PeriodGainLossReconciliation | null> => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);

    const accountBook = await prisma.accountBook.findUniqueOrThrow({
      where: { id: data.accountBookId },
      select: {
        referenceCurrency: true,
        startDate: true,
      },
    });

    const referenceCurrency = accountBook.referenceCurrency.toUpperCase();
    const accountBookStartDate = startOfUtcDay(accountBook.startDate);
    const now = new Date();
    const selection = resolvePeriodSelection({
      periodValue: data.period,
      now,
      firstBookingDate: accountBookStartDate,
    });
    const isBeforeAccountBookStart = selection.to < accountBookStartDate;
    const queryStart = selection.from;
    const queryEndExclusive = getPeriodEndExclusive(selection.to);
    const initialHoldingDate = new Date(
      queryStart.getTime() - 24 * 60 * 60 * 1000,
    );

    const details = data.accountId.startsWith(
      VIRTUAL_TRANSFER_CLEARING_ACCOUNT_PREFIX,
    )
      ? await buildTransferClearingReconciliation({
          accountBookId: data.accountBookId,
          accountId: data.accountId,
          queryStart,
          queryEndExclusive,
          initialHoldingDate,
          periodEnd: selection.to,
          referenceCurrency,
          isBeforeAccountBookStart,
        })
      : await buildRealAccountReconciliation({
          accountBookId: data.accountBookId,
          accountId: data.accountId,
          queryStart,
          queryEndExclusive,
          initialHoldingDate,
          periodEnd: selection.to,
          referenceCurrency,
          isBeforeAccountBookStart,
        });

    if (!details) {
      return null;
    }

    return {
      target: details.target,
      referenceCurrency,
      selectedPeriodValue: selection.periodValue,
      selectedPeriodLabel: selection.label,
      selectedPeriodSpecifier: selection.periodSpecifier,
      selectedGranularity: selection.granularity,
      selectedYear: selection.year,
      selectedMonth: selection.month,
      periodBounds: {
        minBookingDate: accountBookStartDate.toISOString(),
        maxDate: startOfUtcDay(now).toISOString(),
      },
      periodDateRange: {
        from: selection.from.toISOString(),
        to: selection.to.toISOString(),
      },
      summary: details.summary,
      realizedEvents: details.realizedEvents,
      unrealizedOpenLots: details.unrealizedOpenLots,
      diagnostics: {
        skippedCount: details.skippedCount,
        items: details.diagnostics.sort(
          (left, right) =>
            left.date.localeCompare(right.date, "en") ||
            (left.bookingId ?? "").localeCompare(right.bookingId ?? "", "en"),
        ),
      },
    };
  });
