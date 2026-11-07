import { toMoney, type Money } from "../../../shared/money";
import type { ReturnAccount } from "../../../shared/account-return-groups";
import type { HoldingRateResolver } from "../../period/holdings/period-overview-holdings-types";
import { checkResourceBudget } from "../../resource-context.server";
import type { ReturnPositionChange, ReturnBridge } from "./return-transactions";

/** Prefix quantities and shared rate promises avoid replaying lots or re-fetching prices. */
export function createReturnScopeValuer(args: {
  accounts: ReturnAccount[];
  initialBalances: Map<string, Money>;
  changes: ReturnPositionChange[];
  bridges: ReturnBridge[];
  resolveRate: HoldingRateResolver;
}) {
  const quantities = new Map(
    args.accounts.map((account) => {
      let quantity = args.initialBalances.get(account.id) ?? toMoney(0);
      const points = args.changes
        .filter((change) => change.accountId === account.id)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((change) => {
          quantity = quantity.plus(change.quantity);
          return { date: change.date, quantity };
        });
      return [account.id, points];
    }),
  );
  const memo = new Map<string, Promise<Money | null>>();
  return (date: string): Promise<Money | null> => {
    const existing = memo.get(date);
    if (existing) return existing;
    const load = async () => {
      checkResourceBudget();
      const positions: {
        identity: ReturnAccount | ReturnBridge;
        quantity: Money;
      }[] = [];
      for (const account of args.accounts) {
        const points = quantities.get(account.id)!;
        let lo = 0;
        let hi = points.length;
        while (lo < hi) {
          const mid = Math.floor((lo + hi) / 2);
          if (points[mid]!.date <= date) lo = mid + 1;
          else hi = mid;
        }
        const quantity = lo
          ? points[lo - 1]!.quantity
          : (args.initialBalances.get(account.id) ?? toMoney(0));
        if (!quantity.isZero()) positions.push({ identity: account, quantity });
      }
      for (const bridge of args.bridges) {
        const direction =
          (date >= bridge.fromDate ? 1 : 0) - (date >= bridge.toDate ? 1 : 0);
        if (direction)
          positions.push({
            identity: bridge,
            quantity: bridge.quantity.mul(direction),
          });
      }
      // The request's existing scheduler bounds these independent lookups to four.
      const values = await Promise.all(
        positions.map(async ({ identity, quantity }) => {
          if (identity.unit === null) return null;
          const rate = await args.resolveRate({
            ...identity,
            unit: identity.unit,
            date: new Date(`${date}T00:00:00Z`),
          });
          return rate === null ? null : quantity.mul(rate);
        }),
      );
      return values.some((value) => value === null)
        ? null
        : values.reduce<Money>((sum, value) => sum.plus(value!), toMoney(0));
    };
    const promise = load();
    memo.set(date, promise);
    return promise;
  };
}
