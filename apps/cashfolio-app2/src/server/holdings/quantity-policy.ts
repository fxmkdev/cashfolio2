import { moneyAbs, type Money } from "../../shared/money";

export const QUANTITY_EPSILON = 1e-9;

export function isNearZero(value: Money): boolean {
  return !moneyAbs(value).gt(QUANTITY_EPSILON);
}
