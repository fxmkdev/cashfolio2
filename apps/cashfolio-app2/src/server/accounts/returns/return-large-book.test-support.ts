import { account, booking, cash } from "./return-test-support";
import { toMoney } from "../../../shared/money";
import type { ReturnInputs } from "./return-engine.server";

export const LARGE_RETURN_TRANSACTION_COUNT = 100_000;
export const largeReturnDescription = "Synthetic return history 🚀 ".repeat(16);

/** Same-day funding followed by a doubled quote has an independently known 100% return. */
export function largeReturnInputs(): ReturnInputs {
  const accounts = Array.from({ length: 8 }, (_, i) => account(`holding-${i}`));
  const date = "2026-01-01";
  const positive = toMoney(1);
  const negative = toMoney(-1);
  return {
    accounts,
    groups: [
      { id: "group", name: "Group", parentGroupId: null, isActive: true },
    ],
    classes: [
      { id: "equities", name: "Equities", parentId: null, sortOrder: 0 },
    ],
    transactions: Array.from(
      { length: LARGE_RETURN_TRANSACTION_COUNT },
      (_, i) => {
        const transactionId = `transaction-${String(i).padStart(6, "0")}`;
        return {
          bookings: [
            {
              ...booking(`${transactionId}-holding`, date, "1", {
                accountId: accounts[i % accounts.length]!.id,
                transactionId,
                description: largeReturnDescription,
                transactionDescription: largeReturnDescription,
              }),
              value: positive,
            },
            {
              ...cash(`${transactionId}-funding`, date, "-1", {
                accountId: "funding",
                accountType: "EQUITY",
                equityAccountSubtype: "INCOME",
                transactionId,
                description: largeReturnDescription,
                transactionDescription: largeReturnDescription,
              }),
              value: negative,
            },
          ],
        };
      },
    ),
    initialBalances: new Map(),
    revision: "large-revision",
    startDate: date,
    asOfDate: "2026-11-07",
    referenceCurrency: "CHF",
  };
}
