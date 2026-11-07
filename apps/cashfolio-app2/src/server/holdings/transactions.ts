import type { HoldingRateConvertibleAccount } from "./types";
import { toHoldingUnitIdentifier } from "./unit-identity";

export { isWithinPeriod } from "./common";
export { getHoldingTransactionContext } from "./transaction-context";
export { decomposeHoldingTransaction } from "./transaction-decomposition";
export { toHoldingUnitIdentifier } from "./unit-identity";

type MultiUnitBooking = Omit<HoldingRateConvertibleAccount, "id">;

export function isMultiUnitTransaction(bookings: MultiUnitBooking[]): boolean {
  const unitIdentifiers = new Set<string>();

  for (const booking of bookings) {
    const unitIdentifier = toHoldingUnitIdentifier(booking);
    if (!unitIdentifier) {
      return false;
    }
    unitIdentifiers.add(unitIdentifier);
  }

  return unitIdentifiers.size > 1;
}
