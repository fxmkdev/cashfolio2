import { vi } from "vitest";
import { toMoney } from "../../../shared/money";
import type {
  HoldingBookingConverter,
  HoldingRateConvertibleAccount,
  HoldingRateResolver,
  HoldingTransactionBooking,
} from "../../holdings/types";

import type { DecimalValuationRateLookupResult } from "../../valuation/types";

export type Lookup = {
  symbol?: string;
  cryptocurrency?: string;
  sourceCurrency?: string;
  date: Date;
};
const lookup = vi.hoisted(() =>
  vi.fn<(input: Lookup) => Promise<DecimalValuationRateLookupResult>>(),
);
vi.mock("../../valuation.server", () => ({
  getSecurityToCurrencyExchangeRateDetails: lookup,
  getCurrencyExchangeRateDetails: lookup,
  getCryptocurrencyToCurrencyExchangeRateDetails: lookup,
}));
export const period = {
  periodStart: new Date("2026-01-01Z"),
  initialRateDate: new Date("2025-12-31Z"),
  periodEnd: new Date("2026-04-30Z"),
  periodEndExclusive: new Date("2026-05-01Z"),
};

export const executionDate = new Date("2026-02-01Z");
export const rateResult = (value = 100): DecimalValuationRateLookupResult => ({
  rate: toMoney(value),
  source: "timeSeries",
});
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

export function account(id: string): HoldingRateConvertibleAccount {
  return {
    id,
    unit: "SECURITY",
    currency: null,
    cryptocurrency: null,
    symbol: id.toUpperCase(),
    tradeCurrency: "CHF",
  };
}

export function booking(
  holding: HoldingRateConvertibleAccount,
  value = 1,
  id = holding.id,
): HoldingTransactionBooking {
  return {
    ...holding,
    id,
    accountId: holding.id,
    value: toMoney(value),
    date: executionDate,
    accountType: "BALANCE",
    equityAccountSubtype: null,
  };
}

export function lookups() {
  const context = {
    referenceCurrency: "CHF",
    exchangeRateByKey: new Map<
      string,
      Promise<DecimalValuationRateLookupResult>
    >(),
    scheduleLookup: createAccountGainLossLookupScheduler(),
  };
  const resolveRate: HoldingRateResolver = async (input) =>
    (await getUnitToReferenceExchangeRateDetails({ ...input, ...context }))
      .rate;
  const convertBookingToReference: HoldingBookingConverter = async (input) =>
    (await convertBookingValueToReferenceDetails({ ...input, ...context }))
      .value;
  return { resolveRate, convertBookingToReference };
}

export function trade(
  holding: HoldingRateConvertibleAccount,
  value = 1,
  id = holding.id,
) {
  return {
    bookings: [
      booking(holding, value, id),
      booking(
        { ...account("cash"), unit: "CURRENCY", symbol: null, currency: "CHF" },
        -value * 100,
        `cash:${id}`,
      ),
    ],
  };
}

export function resetPrefetchLookups() {
  lookup.mockReset();
}

export {
  calculateAccountGainLoss,
  convertBookingValueToReferenceDetails,
  createAccountGainLossLookupScheduler,
  getUnitToReferenceExchangeRateDetails,
  initializeHoldingGainLossState,
  lookup,
  prefetchAccountGainLossConversions,
  valueAccountGainLossBasis,
};

// Register mocks before loading any tested module or its transitive dependencies.
const {
  createAccountGainLossLookupScheduler,
  prefetchAccountGainLossConversions,
} = await import("./prefetch.server");
const {
  convertBookingValueToReferenceDetails,
  getUnitToReferenceExchangeRateDetails,
} = await import("../../period/period-conversion");
const { initializeHoldingGainLossState } =
  await import("../../holdings/engine");
const { calculateAccountGainLoss, valueAccountGainLossBasis } =
  await import("./calculation.server");
