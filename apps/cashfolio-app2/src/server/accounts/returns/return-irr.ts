import { MoneyDecimal, toMoney, type Money } from "../../../shared/money";
import { checkResourceBudget } from "../../resource-context.server";

type Term = { amount: Money; time: Money };
const EPSILON = toMoney("1e-22");

/** Scale each exponential sum before evaluating it, including at extreme brackets. */
function evaluate(terms: Term[], x: Money) {
  checkResourceBudget();
  const powers = terms.map((term) => term.time.mul(x).neg());
  const scale = MoneyDecimal.max(...powers);
  return terms.reduce(
    (sum, term, index) =>
      sum.plus(term.amount.mul(powers[index]!.minus(scale).exp())),
    toMoney(0),
  );
}

function bisect(terms: Term[], left: Money, right: Money) {
  let leftSign = evaluate(terms, left).comparedTo(0);
  for (let iteration = 0; iteration < 180; iteration += 1) {
    const middle = left.plus(right).div(2);
    const value = evaluate(terms, middle);
    if (value.abs().lt(EPSILON) || right.minus(left).abs().lt(EPSILON))
      return middle;
    if (value.comparedTo(0) === leftSign) {
      left = middle;
      leftSign = value.comparedTo(0);
    } else right = middle;
  }
  throw new Error("Money-weighted return did not converge.");
}

/** Outside these bounds the first/last term strictly dominates all other terms. */
function rootBounds(terms: Term[]) {
  const first = terms[0]!;
  const last = terms.at(-1)!;
  const multiplier = toMoney(terms.length * 2);
  let left = toMoney(-1);
  let right = toMoney(1);
  for (const term of terms.slice(1)) {
    right = MoneyDecimal.max(
      right,
      term.amount
        .abs()
        .mul(multiplier)
        .div(first.amount.abs())
        .ln()
        .div(term.time.minus(first.time)),
    );
  }
  for (const term of terms.slice(0, -1)) {
    left = MoneyDecimal.min(
      left,
      term.amount
        .abs()
        .mul(multiplier)
        .div(last.amount.abs())
        .ln()
        .div(last.time.minus(term.time))
        .neg(),
    );
  }
  return { left, right };
}

/** Rolle isolation finds crossing AND tangent roots; a guess-based XIRR cannot. */
function isolate(terms: Term[], depth = 0): Money[] {
  if (terms.length < 2) return [];
  if (depth > 128)
    throw new Error(
      "Money-weighted return is too complex to resolve uniquely.",
    );
  const signs = terms
    .slice(1)
    .reduce(
      (changes, term, index) =>
        changes +
        (term.amount.comparedTo(0) !== terms[index]!.amount.comparedTo(0)
          ? 1
          : 0),
      0,
    );
  if (signs === 0) return [];
  const { left, right } = rootBounds(terms);
  if (signs === 1) return [bisect(terms, left, right)];
  // Factoring out the first exponential preserves roots and removes one derivative term.
  const origin = terms[0]!.time;
  const derivative = terms.slice(1).map((term) => ({
    time: term.time.minus(origin),
    amount: term.amount.mul(term.time.minus(origin)).neg(),
  }));
  const stationary = isolate(derivative, depth + 1).filter(
    (x) => x.gt(left) && x.lt(right),
  );
  const boundaries = [left, ...stationary, right];
  const roots: Money[] = [];
  for (const point of stationary) {
    if (evaluate(terms, point).abs().lt(EPSILON)) roots.push(point);
  }
  for (let index = 1; index < boundaries.length; index += 1) {
    const a = boundaries[index - 1]!;
    const b = boundaries[index]!;
    const fa = evaluate(terms, a);
    const fb = evaluate(terms, b);
    if (
      fa.abs().gte(EPSILON) &&
      fb.abs().gte(EPSILON) &&
      fa.comparedTo(0) !== fb.comparedTo(0)
    )
      roots.push(bisect(terms, a, b));
  }
  return roots.sort((a, b) => a.comparedTo(b));
}

/** Investor-sign flows; day offsets are normalized to the effective investment span. */
export function calculateMoneyWeightedReturn(
  cashFlows: { days: number; amount: Money }[],
  durationDays: number,
): Money {
  if (durationDays <= 0) throw new Error("An investment duration is required.");
  const byDay = new Map<number, Money>();
  for (const flow of cashFlows)
    byDay.set(
      flow.days,
      (byDay.get(flow.days) ?? toMoney(0)).plus(flow.amount),
    );
  const terms = [...byDay]
    .sort(([a], [b]) => a - b)
    .filter(([, amount]) => !amount.isZero())
    .map(([days, amount]) => ({
      amount,
      time: toMoney(days).div(durationDays),
    }));
  if (terms.length && terms.every((term) => term.amount.isNegative()))
    return toMoney(-1);
  if (
    !terms.some((term) => term.amount.isNegative()) ||
    !terms.some((term) => term.amount.isPositive())
  )
    throw new Error(
      "Money-weighted return requires invested capital and a withdrawal or terminal value.",
    );
  // Normalize coefficients so root tolerances are independent of account size.
  const scale = MoneyDecimal.max(...terms.map((term) => term.amount.abs()));
  const roots = isolate(
    terms.map((term) => ({ ...term, amount: term.amount.div(scale) })),
  );
  if (roots.length !== 1)
    throw new Error(
      roots.length > 1
        ? "Multiple money-weighted returns are possible for these cash flows."
        : "No money-weighted return exists for these cash flows.",
    );
  const result = roots[0]!.exp().minus(1);
  if (!Number.isFinite(result.toNumber()))
    throw new Error("Money-weighted return exceeds the display range.");
  return result;
}
