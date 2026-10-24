import type { AccountType } from "../../.prisma-client/enums";
import { isBalanceAccount } from "../../shared/account-presentation";
import { type Money, toMoney, moneyAbs, moneyIsZero } from "../../shared/money";

export type BalanceSide = "asset" | "liability";

/** Classify exact reference-currency balances before rounding or grouping. */
export function classifyBalanceAccount(
  type: AccountType,
  balance: Money | null | undefined,
): { side: BalanceSide; amount: Money } | null {
  if (!isBalanceAccount({ type }) || balance == null || moneyIsZero(balance)) {
    return null;
  }
  return {
    side: toMoney(balance).isPositive() ? "asset" : "liability",
    amount: moneyAbs(balance),
  };
}
