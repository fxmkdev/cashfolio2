import { moneySum, toMoneyNumber } from "./shared/money";

export function sum(values: number[]): number {
  return toMoneyNumber(moneySum(values));
}
