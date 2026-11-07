import type { ReturnAccount } from "../../../shared/account-return-groups";
import { toMoney } from "../../../shared/money";
import type {
  HoldingTransactionBooking,
  HoldingRateResolver,
} from "../../period/holdings/period-overview-holdings-types";
import { prepareReturnTransactions } from "./return-transactions";
import { calculateAccountReturns } from "./return-calculation";

export const account = (
  id = "a",
  overrides: Partial<ReturnAccount> = {},
): ReturnAccount => ({
  id,
  name: id,
  groupId: "group",
  isActive: true,
  assetClassId: "equities",
  trackingMethod: "INDIVIDUAL_UNITS",
  unit: "CURRENCY",
  currency: "USD",
  cryptocurrency: null,
  symbol: null,
  tradeCurrency: null,
  ...overrides,
});
export const booking = (
  id: string,
  date: string,
  value: string,
  overrides: Partial<HoldingTransactionBooking> = {},
): HoldingTransactionBooking => ({
  id,
  transactionId: id,
  description: id,
  accountId: "a",
  accountType: "BALANCE",
  equityAccountSubtype: null,
  date: new Date(`${date}T00:00:00Z`),
  value: toMoney(value),
  unit: "CURRENCY",
  currency: "USD",
  cryptocurrency: null,
  symbol: null,
  tradeCurrency: null,
  ...overrides,
});
export const cash = (
  id: string,
  date: string,
  value: string,
  overrides: Partial<HoldingTransactionBooking> = {},
) =>
  booking(id, date, value, {
    accountId: "cash",
    currency: "CHF",
    ...overrides,
  });
export const defaultRate: HoldingRateResolver = async (input) =>
  toMoney(input.currency === "CHF" ? 1 : 1.1);

export async function returns(args: {
  accounts?: ReturnAccount[];
  transactions?: HoldingTransactionBooking[][];
  initial?: Record<string, string>;
  ids?: string[];
  rate?: HoldingRateResolver;
  startDate?: string;
  asOfDate?: string;
}) {
  const accounts = args.accounts ?? [account()];
  const resolveRate = args.rate ?? defaultRate;
  const inputs = {
    accounts,
    transactions: (args.transactions ?? []).map((bookings) => ({ bookings })),
    startDate: args.startDate ?? "2026-01-01",
    asOfDate: args.asOfDate ?? "2026-12-31",
    referenceCurrency: "CHF",
  };
  const prepared = await prepareReturnTransactions({
    ...inputs,
    convert: async (item) => {
      const rate = await resolveRate(item);
      return rate === null ? null : item.value.mul(rate);
    },
  });
  const result = await calculateAccountReturns({
    ...inputs,
    accounts: accounts.filter(
      (item) => !args.ids || args.ids.includes(item.id),
    ),
    name: "Test",
    applicable: true,
    prepared,
    resolveRate,
    initialBalances: new Map(
      Object.entries(args.initial ?? {}).map(([id, value]) => [
        id,
        toMoney(value),
      ]),
    ),
  });
  return { result, prepared };
}
