import { MoneyDecimal, toMoney, type Money } from "../../../shared/money";
import { checkResourceBudget } from "../../resource-context.server";

type Term = { amount: Money; days: number };
type Bracket = { left: Money; right: Money };
const EPSILON = toMoney("1e-22");
const MAX_WORK = 2_000_000;

/** Work limits are metric-local; request cancellation still propagates. */
function createSolver() {
  let work = 0;
  const charge = (count: number) => {
    checkResourceBudget();
    work += count;
    if (work > MAX_WORK)
      throw new Error(
        "Money-weighted return is too complex to resolve uniquely.",
      );
  };
  // Integer accounting-day powers allow Horner evaluation with one exponential.
  // Reverse for negative log rates so every power is <= 1, avoiding overflow.
  const evaluate = (terms: Term[], x: Money) => {
    charge(terms.length);
    const q = x.abs().neg().exp();
    const ordered = x.isNegative() ? terms : terms.toReversed();
    const powers = new Map<number, Money>([[1, q]]);
    let value = ordered[0]!.amount;
    for (let i = 1; i < ordered.length; i++) {
      const gap = Math.abs(ordered[i]!.days - ordered[i - 1]!.days);
      let power = powers.get(gap);
      if (!power) {
        power = q.pow(gap);
        powers.set(gap, power);
      }
      value = value.mul(power).plus(ordered[i]!.amount);
    }
    return value;
  };
  const bisect = (terms: Term[], bracket: Bracket) => {
    let { left, right } = bracket;
    let fa = evaluate(terms, left);
    let fb = evaluate(terms, right);
    let leftSign = fa.comparedTo(0);
    for (let iteration = 0; iteration < 180; iteration++) {
      const width = right.minus(left);
      const secant = fa.eq(fb)
        ? left.plus(right).div(2)
        : right.minus(fb.mul(width).div(fb.minus(fa)));
      const middle =
        secant.gt(left.plus(width.div(4))) &&
        secant.lt(right.minus(width.div(4)))
          ? secant
          : left.plus(right).div(2);
      const value = evaluate(terms, middle);
      if (right.minus(left).abs().lt(EPSILON))
        return { root: middle, left, right };
      if (value.isZero()) {
        const radius = EPSILON.div(4);
        return {
          root: middle,
          left: middle.minus(radius),
          right: middle.plus(radius),
        };
      }
      if (value.comparedTo(0) === leftSign) {
        left = middle;
        leftSign = value.comparedTo(0);
        fa = value;
      } else {
        right = middle;
        fb = value;
      }
    }
    throw new Error("Money-weighted return did not converge.");
  };
  // Outside these bounds the first/last term strictly dominates all other terms.
  const rootBounds = (terms: Term[]): Bracket => {
    const first = terms[0]!;
    const last = terms.at(-1)!;
    const multiplier = toMoney(terms.length * 2);
    let left = toMoney(-1);
    let right = toMoney(1);
    for (const term of terms.slice(1)) {
      charge(1);
      right = MoneyDecimal.max(
        right,
        term.amount
          .abs()
          .mul(multiplier)
          .div(first.amount.abs())
          .ln()
          .div(term.days - first.days),
      );
    }
    for (const term of terms.slice(0, -1)) {
      charge(1);
      left = MoneyDecimal.min(
        left,
        term.amount
          .abs()
          .mul(multiplier)
          .div(last.amount.abs())
          .ln()
          .div(last.days - term.days)
          .neg(),
      );
    }
    return { left, right };
  };
  /**
   * Certify uniqueness over ALL real log rates. Abel summation excludes roots
   * outside a bracket whose discounted proper prefixes are negative and whose
   * endpoint NPVs are positive/negative. Inside it, an interval upper bound on
   * d(exp(lastDay*x)*NPV)/dx must be negative. Otherwise use Rolle isolation.
   */
  const unique = (terms: Term[], { left, right }: Bracket) => {
    const last = terms.at(-1)!.days;
    for (const [x, expected] of [
      [left, 1],
      [right, -1],
    ] as const) {
      charge(terms.length);
      const scale = x.isNegative() ? x.mul(last).neg() : toMoney(0);
      let sum = toMoney(0);
      for (let i = 0; i < terms.length; i++) {
        const term = terms[i]!;
        sum = sum.plus(term.amount.mul(x.mul(-term.days).minus(scale).exp()));
        if (i < terms.length - 1 && sum.gte(EPSILON.neg())) return false;
      }
      if (sum.comparedTo(0) !== expected) return false;
    }
    charge(terms.length);
    const scale = MoneyDecimal.max(0, right.mul(last));
    let upper = toMoney(0);
    for (const term of terms.slice(0, -1)) {
      const gap = last - term.days;
      upper = upper.plus(
        term.amount
          .mul(gap)
          .mul(
            (term.amount.isPositive() ? right : left)
              .mul(gap)
              .minus(scale)
              .exp(),
          ),
      );
    }
    return upper.lt(EPSILON.neg());
  };
  // The original bracket also bounds the derivative roots needed for isolation;
  // stationary points outside it cannot separate roots inside it.
  const isolate = (terms: Term[], bounds: Bracket, depth = 0): Money[] => {
    charge(terms.length);
    if (terms.length < 2) return [];
    if (depth > 128)
      throw new Error(
        "Money-weighted return is too complex to resolve uniquely.",
      );
    const signs = terms
      .slice(1)
      .reduce(
        (n, term, i) =>
          n +
          (term.amount.comparedTo(0) !== terms[i]!.amount.comparedTo(0)
            ? 1
            : 0),
        0,
      );
    if (!signs) return [];
    const fa = evaluate(terms, bounds.left);
    const fb = evaluate(terms, bounds.right);
    if (signs === 1)
      return fa.comparedTo(0) !== fb.comparedTo(0)
        ? [bisect(terms, bounds).root]
        : [];
    const origin = terms[0]!.days;
    const derivative = terms.slice(1).map((term) => ({
      days: term.days - origin,
      amount: term.amount.mul(term.days - origin).neg(),
    }));
    const scale = MoneyDecimal.max(
      ...derivative.map((term) => term.amount.abs()),
    );
    const stationary = isolate(
      derivative.map((term) => ({ ...term, amount: term.amount.div(scale) })),
      bounds,
      depth + 1,
    );
    const boundaries = [bounds.left, ...stationary, bounds.right];
    const roots = stationary.filter((point) =>
      evaluate(terms, point).abs().lt(EPSILON),
    );
    for (let i = 1; i < boundaries.length; i++) {
      const left = boundaries[i - 1]!;
      const right = boundaries[i]!;
      const a = evaluate(terms, left);
      const b = evaluate(terms, right);
      if (
        a.abs().gte(EPSILON) &&
        b.abs().gte(EPSILON) &&
        a.comparedTo(0) !== b.comparedTo(0)
      )
        roots.push(bisect(terms, { left, right }).root);
    }
    return roots.sort((a, b) => a.comparedTo(b));
  };
  return (terms: Term[]) => {
    if (terms[0]!.amount.isNegative() && terms.at(-1)!.amount.isPositive()) {
      const zero = toMoney(0);
      const atZero = evaluate(terms, zero);
      if (atZero.isZero()) {
        const candidate = { root: zero, left: EPSILON.neg(), right: EPSILON };
        if (unique(terms, candidate)) return [zero];
      } else {
        let step = toMoney(1).div(Math.max(1, terms.at(-1)!.days));
        for (let attempt = 0; attempt < 64; attempt++) {
          const edge = atZero.isPositive() ? step : step.neg();
          if (evaluate(terms, edge).comparedTo(0) !== atZero.comparedTo(0)) {
            const candidate = bisect(
              terms,
              edge.isNegative()
                ? { left: edge, right: zero }
                : { left: zero, right: edge },
            );
            if (unique(terms, candidate)) return [candidate.root];
            break;
          }
          step = step.mul(2);
        }
      }
    }
    return isolate(terms, rootBounds(terms));
  };
}

/** Daily log rates give the dated actual-days/365 XIRR and its cumulative value. */
export function calculateMoneyWeightedReturn(
  cashFlows: { days: number; amount: Money }[],
  durationDays: number,
): Money {
  if (durationDays <= 0) throw new Error("An investment duration is required.");
  const byDay = new Map<number, Money>();
  for (const flow of cashFlows) {
    checkResourceBudget();
    if (!Number.isSafeInteger(flow.days))
      throw new Error("Cash-flow dates must use whole accounting days.");
    byDay.set(
      flow.days,
      (byDay.get(flow.days) ?? toMoney(0)).plus(flow.amount),
    );
  }
  const terms = [...byDay]
    .sort(([a], [b]) => a - b)
    .filter(([, amount]) => !amount.isZero())
    .map(([days, amount]) => ({ days, amount }));
  if (terms.length && terms.every((term) => term.amount.isNegative()))
    return toMoney(-1);
  if (
    !terms.some((term) => term.amount.isNegative()) ||
    !terms.some((term) => term.amount.isPositive())
  )
    throw new Error(
      "Money-weighted return requires invested capital and a withdrawal or terminal value.",
    );
  const scale = MoneyDecimal.max(...terms.map((term) => term.amount.abs()));
  const origin = terms[0]!.days;
  const roots = createSolver()(
    terms.map((term) => ({
      days: term.days - origin,
      amount: term.amount.div(scale),
    })),
  );
  if (roots.length !== 1)
    throw new Error(
      roots.length > 1
        ? "Multiple money-weighted returns are possible for these cash flows."
        : "No money-weighted return exists for these cash flows.",
    );
  const result = roots[0]!.mul(durationDays).exp().minus(1);
  if (!Number.isFinite(result.toNumber()))
    throw new Error("Money-weighted return exceeds the display range.");
  return result;
}
