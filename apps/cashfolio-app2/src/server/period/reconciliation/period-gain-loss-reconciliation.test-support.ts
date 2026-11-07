import { expect, vi } from "vitest";
import { AccountType, Unit } from "../../../.prisma-client/enums";
import { addUtcDays } from "../../../shared/date";
import { toMoney, type MoneyInput } from "../../../shared/money";
import { filterConvertibleHoldingAccounts } from "../../holdings/events";
import type {
  PeriodBaseData,
  PeriodBaseHoldingTransaction,
} from "../base-data/period-base-data-types";
import {
  getPeriodEndExclusive,
  resolvePeriodSelection,
} from "../period-selection";
import type { TransferClearingBooking } from "../transfer-clearing/period-transfer-clearing-types";

export let baseData: PeriodBaseData;
export function setAccounts(
  accounts: (Partial<PeriodBaseData["baseAssetLiabilityAccounts"][number]> & {
    id: string;
  })[],
) {
  baseData.baseAssetLiabilityAccounts = accounts.map((account) => ({
    name: "AAPL Trading",
    type: AccountType.BALANCE,
    groupId: null,
    assetClassId: null,
    isCashAccount: false,
    unit: null,
    currency: null,
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    ...account,
  }));
  baseData.holdingAccountsResolved = filterConvertibleHoldingAccounts(
    baseData.baseAssetLiabilityAccounts,
    baseData.referenceCurrency,
  );
}

export type FixtureBooking = Omit<
  PeriodBaseHoldingTransaction["bookings"][number],
  "value" | "accountType" | "equityAccountSubtype"
> & {
  value: MoneyInput;
  account: { type: AccountType; equityAccountSubtype: null };
};

export function setHoldingTransactions(
  transactions: {
    id: string;
    description?: string;
    bookings: FixtureBooking[];
  }[],
) {
  baseData.holdingTransactions = transactions.map((transaction) => ({
    id: transaction.id,
    bookings: transaction.bookings.map(({ account, value, ...booking }) => ({
      ...booking,
      value: toMoney(value),
      transactionId: transaction.id,
      transactionDescription: transaction.description,
      accountType: account.type,
      equityAccountSubtype: account.equityAccountSubtype,
    })),
  }));
}

export function setTransferClearingBookings(
  bookings: (Omit<TransferClearingBooking, "value"> & { value: MoneyInput })[],
) {
  baseData.transferClearingUnitBuckets = [
    {
      unitKey: "security:AAPL:USD",
      unitLabel: "AAPL:USD",
      unitType: "security",
      unit: Unit.SECURITY,
      currency: null,
      cryptocurrency: null,
      symbol: "AAPL",
      tradeCurrency: "USD",
      isNonReferenceUnit: true,
      rawBalance: toMoney(-6),
      bookings: bookings.map((booking) => ({
        ...booking,
        value: toMoney(booking.value),
      })),
    },
  ];
}
const createServerFn = vi.hoisted(() =>
  vi.fn(() => {
    let validate: ((data: unknown) => unknown) | undefined;
    const chain = {
      validator: vi.fn((validator: (data: unknown) => unknown) => {
        validate = validator;
        return chain;
      }),
      handler: vi.fn((handler: ({ data }: { data: unknown }) => unknown) => {
        return async ({ data }: { data: unknown }) => {
          const validatedData = validate ? validate(data) : data;
          return handler({ data: validatedData });
        };
      }),
    };
    return chain;
  }),
);
const ensureAuthorizedForAccountBookId = vi.hoisted(() => vi.fn());
const convertBookingValueToReference = vi.hoisted(() => vi.fn());
const getUnitToReferenceExchangeRate = vi.hoisted(() => vi.fn());
const prisma = vi.hoisted(() => ({
  accountBook: {
    findUniqueOrThrow: vi.fn(),
  },
  account: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  booking: {
    groupBy: vi.fn(),
    findMany: vi.fn(),
  },
  transaction: {
    findMany: vi.fn(),
  },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn,
}));
vi.mock("../../../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId,
}));
vi.mock("../../../prisma.server", () => ({
  prisma,
}));
vi.mock("../period-conversion", () => ({
  convertBookingValueToReference,
  getUnitToReferenceExchangeRate,
}));
const getOrLoadPeriodBaseData = vi.hoisted(() => vi.fn());
const loadAccountGainLossSources = vi.hoisted(() => vi.fn());
vi.mock("../cache/period-base-data-cache", () => ({ getOrLoadPeriodBaseData }));
vi.mock("./period-account-gain-loss-sources", () => ({
  loadAccountGainLossSources,
}));

export function resetReconciliationFixture() {
  vi.useFakeTimers();
  vi.resetAllMocks();
  vi.setSystemTime(new Date("2026-03-10T12:00:00.000Z"));

  const selection = resolvePeriodSelection({
    periodValue: "2026-02",
    firstBookingDate: new Date("2026-01-01"),
  });
  baseData = {
    accountBookId: "book-1",
    periodValue: "2026-02",
    referenceCurrency: "CHF",
    selection: {
      ...selection,
      queryEndExclusive: getPeriodEndExclusive(selection.to),
      initialHoldingDate: addUtcDays(selection.from, -1),
      minPeriodDate: new Date("2026-01-01"),
      isBeforeAccountBookStart: false,
    },
    baseAssetLiabilityAccounts: [],
    holdingAccountsResolved: [],
    initialHoldingBalances: [],
    holdingTransactions: [],
    transferClearingUnitBuckets: [],
    allAccountGroups: [],
    endOfPeriodRawBalances: [],
    equityBookings: [],
    explicitCounterparts: [],
    executionResidualTransactions: [],
    cashFlowTransactions: [],
    hasCashAccounts: false,
  };
  getOrLoadPeriodBaseData.mockImplementation(async () => baseData);
  loadAccountGainLossSources.mockResolvedValue({
    node: undefined,
    contribution: undefined,
    recordedAdjustments: [],
    executionResiduals: [],
  });
}

export function cleanupReconciliationFixture() {
  vi.useRealTimers();
  // No settings, account, balance, transaction, or transfer-clearing rereads
  // may escape the snapshot loader, even while external valuation is pending.
  for (const model of Object.values(prisma)) {
    for (const query of Object.values(model))
      expect(query).not.toHaveBeenCalled();
  }
}

export {
  convertBookingValueToReference,
  createServerFn,
  ensureAuthorizedForAccountBookId,
  getOrLoadPeriodBaseData,
  getPeriodGainLossReconciliation,
  getPeriodGainLossReconciliationPageData,
  getUnitToReferenceExchangeRate,
  loadAccountGainLossSources,
  prisma,
};

// Register mocks before loading any tested module or its transitive dependencies.
const {
  getPeriodGainLossReconciliation,
  getPeriodGainLossReconciliationPageData,
} = await import("./period-gain-loss-reconciliation");
