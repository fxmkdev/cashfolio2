import type { ValuationLookupScheduler } from "../period/period-conversion";
import { getHoldingTransactionContext } from "../period/holdings/holding-transaction-context";
import { isMixedPeriodSameUnitHoldingTransfer } from "../period/holdings/period-overview-holdings-mixed-transfer";
import type { applyHoldingTransactionsToGainLossState } from "../period/holdings/period-overview-holdings";
import type { HoldingBookingConverter } from "../period/holdings/period-overview-holdings-types";

export const ACCOUNT_GAIN_LOSS_LOOKUP_CONCURRENCY = 4;

/** Shared by all valuation phases of one calculation; rate memoization runs first. */
export function createAccountGainLossLookupScheduler(): ValuationLookupScheduler {
  let active = 0;
  const pending: (() => void)[] = [];
  return (lookup) =>
    new Promise((resolve, reject) => {
      const start = () => {
        active += 1;
        void Promise.resolve()
          .then(lookup)
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            pending.shift()?.();
          });
      };
      if (active < ACCOUNT_GAIN_LOSS_LOOKUP_CONCURRENCY) start();
      else pending.push(start);
    });
}

/** Warm conversions without changing lots, counters, or ordered diagnostic callbacks. */
export async function prefetchAccountGainLossConversions(
  args: Parameters<typeof applyHoldingTransactionsToGainLossState>[0],
) {
  const convertedByBookingId = new Map<
    string,
    ReturnType<HoldingBookingConverter>
  >();
  const convertBookingToReference: HoldingBookingConverter = (booking) => {
    const existing = convertedByBookingId.get(booking.id);
    if (existing) return existing;
    const promise = Promise.resolve().then(() =>
      args.convertBookingToReference(booking),
    );
    convertedByBookingId.set(booking.id, promise);
    return promise;
  };
  const conversions = args.transactions.flatMap((transaction) => {
    const context = getHoldingTransactionContext({ ...args, transaction });
    if (
      !context.inPeriodHoldingBookings.length ||
      context.isChronologicalTransfer
    )
      return [];
    return isMixedPeriodSameUnitHoldingTransfer(context)
      ? context.inPeriodHoldingBookings
      : context.allNonExplicitBookings;
  });
  // Attach handlers to every lookup immediately, including when one rejects.
  await Promise.all(conversions.map(convertBookingToReference));
  return convertBookingToReference;
}
