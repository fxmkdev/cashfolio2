import { toMoney, type Money } from "../../../shared/money";
import { Temporal } from "../../../shared/temporal";
import {
  emptyAccountReturnResult,
  type AccountReturnDetails,
  type AccountReturnCashFlow,
} from "../../../shared/account-returns";
import type { ReturnAccount } from "../../../shared/account-return-groups";
import type { HoldingRateResolver } from "../../period/holdings/period-overview-holdings-types";
import type { PreparedReturnTransactions } from "./return-transactions";
import { calculateMoneyWeightedReturn } from "./return-irr";
import { ResourceLimitError } from "../../resource-error";
import { createReturnScopeValuer } from "./return-valuation";

const addDays = (date: string, days: number) =>
  Temporal.PlainDate.from(date).add({ days }).toString();
const daysBetween = (a: string, b: string) =>
  Temporal.PlainDate.from(a).until(Temporal.PlainDate.from(b), {
    largestUnit: "day",
  }).days;
const numeric = (amount: Money | null) =>
  amount === null ? null : amount.toNumber();

export async function calculateAccountReturns(args: {
  name: string;
  accounts: ReturnAccount[];
  applicable: boolean;
  initialBalances: Map<string, Money>;
  prepared: PreparedReturnTransactions;
  startDate: string;
  asOfDate: string;
  referenceCurrency: string;
  resolveRate: HoldingRateResolver;
  /** Discover valuation dependencies without solving metrics or publishing values. */
  valuationOnly?: boolean;
}): Promise<AccountReturnDetails> {
  const { prepared, startDate, asOfDate } = args;
  const result: AccountReturnDetails = {
    ...emptyAccountReturnResult(args.applicable),
    name: args.name,
    referenceCurrency: args.referenceCurrency,
    startDate,
    asOfDate,
    valuations: [],
    cashFlows: [],
  };
  if (!args.applicable) return result;
  if (asOfDate < startDate) {
    result.diagnostics.push({
      metric: "both",
      message: "The as-of date is before book start.",
    });
    return result;
  }
  const ids = new Set(args.accounts.map((account) => account.id));
  const failures = [
    ...new Set([...ids].flatMap((id) => prepared.failures.get(id) ?? [])),
  ];
  if (failures.length) {
    result.diagnostics = failures.map((message) => ({
      metric: "both",
      message,
    }));
    return result;
  }
  const changes = prepared.changes.filter((change) =>
    ids.has(change.accountId),
  );
  const bridges = prepared.bridges.filter(
    (bridge) => ids.has(bridge.fromId) && ids.has(bridge.toId),
  );
  const flows = prepared.movements.filter(
    (flow) =>
      ids.has(flow.accountId) &&
      (!flow.peerId || !ids.has(flow.peerId)) &&
      flow.date >= startDate &&
      flow.date <= asOfDate,
  );
  const netFlows = new Map<string, AccountReturnCashFlow & { exact: Money }>();
  for (const flow of flows) {
    const key = `${flow.date}:${flow.transactionId ?? flow.id}`;
    const item = netFlows.getOrInsertComputed(key, () => ({
      id: key,
      date: flow.date,
      amount: 0,
      exact: toMoney(0),
      transactionId: flow.transactionId,
      description: flow.description,
    }));
    item.exact = item.exact.plus(flow.amount);
  }
  const capital = [...netFlows.values()]
    .filter((flow) => !flow.exact.isZero())
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  result.cashFlows = capital.map(({ exact, ...flow }) => ({
    ...flow,
    amount: exact.toNumber(),
  }));
  const valueAt = createReturnScopeValuer({ ...args, changes, bridges });
  const dates = new Set([
    asOfDate,
    ...changes.map((change) => change.date),
    ...capital.map((flow) => flow.date),
    ...bridges.flatMap((bridge) => [bridge.fromDate, bridge.toDate]),
  ]);
  const eventDays = [...dates]
    .filter((date) => date >= startDate && date <= asOfDate)
    .sort();
  let previousDate = addDays(startDate, -1);
  const opening = await valueAt(previousDate);
  const closing = await valueAt(asOfDate);
  let previous = opening;
  let twrFactor = toMoney(1);
  let twrAvailable = true;
  let negative = false;
  let effectiveStart: string | null = opening?.gt(0) ? startDate : null;
  let effectiveEnd: string | null = null;
  const append = (
    from: string,
    date: string,
    begin: Money | null,
    end: Money | null,
    contributions: Money,
    withdrawals: Money,
  ) => {
    let factor: Money | null = null;
    if (begin?.gt(0) || end?.gt(0) || contributions.gt(0) || withdrawals.gt(0))
      effectiveEnd = date;
    if (begin?.lt(0) || end?.lt(0)) negative = true;
    if (begin === null || end === null) {
      twrAvailable = false;
      result.diagnostics.push({
        metric: "twr",
        date,
        message: "An intermediate valuation is unavailable.",
      });
    } else {
      const denominator = begin.plus(contributions);
      const numerator = end.plus(withdrawals);
      if (denominator.gt(0) && numerator.gte(0))
        factor = numerator.div(denominator);
      else if (!denominator.isZero() || !numerator.isZero()) {
        twrAvailable = false;
        result.diagnostics.push({
          metric: "twr",
          date,
          message:
            "Time-weighted return has no positive invested-capital denominator.",
        });
      }
      if (factor !== null) twrFactor = twrFactor.mul(factor);
    }
    result.valuations.push({
      id: `${from}:${date}`,
      startDate: from,
      date,
      openingValue: numeric(begin),
      closingValue: numeric(end),
      contributions: contributions.toNumber(),
      withdrawals: withdrawals.toNumber(),
      factor: numeric(factor),
    });
  };
  for (const date of eventDays) {
    const before = addDays(date, -1);
    if (before > previousDate) {
      const end = await valueAt(before);
      append(
        addDays(previousDate, 1),
        before,
        previous,
        end,
        toMoney(0),
        toMoney(0),
      );
      previous = end;
    }
    let contributions = toMoney(0);
    let withdrawals = toMoney(0);
    for (const flow of capital.filter((flow) => flow.date === date)) {
      if (flow.exact.gt(0)) contributions = contributions.plus(flow.exact);
      else withdrawals = withdrawals.minus(flow.exact);
    }
    const end = await valueAt(date);
    if (!effectiveStart && contributions.gt(0)) effectiveStart = date;
    append(date, date, previous, end, contributions, withdrawals);
    previous = end;
    previousDate = date;
  }
  result.effectiveStartDate = effectiveStart;
  result.effectiveEndDate = closing?.gt(0) ? asOfDate : effectiveEnd;
  if (args.valuationOnly) return result;
  if (negative) {
    result.diagnostics = [
      {
        metric: "both",
        message:
          "Returns are unavailable when invested value becomes negative.",
      },
    ];
    return result;
  }
  if (!effectiveStart || !result.effectiveEndDate) {
    result.diagnostics.push({
      metric: opening === null || closing === null ? "mwr" : "both",
      message:
        opening === null || closing === null
          ? "Opening or terminal valuation is unavailable."
          : "No invested capital is available in this range.",
    });
    return result;
  }
  const duration = daysBetween(
    effectiveStart,
    addDays(result.effectiveEndDate, 1),
  );
  if (twrAvailable) {
    const total = twrFactor.minus(1);
    if (Number.isFinite(total.toNumber())) {
      result.twr = total.toNumber();
      if (duration >= 365)
        result.annualizedTwr = twrFactor
          .pow(toMoney(365).div(duration))
          .minus(1)
          .toNumber();
    } else
      result.diagnostics.push({
        metric: "twr",
        message: "Time-weighted return exceeds the display range.",
      });
  }
  if (opening === null || closing === null) {
    result.diagnostics.push({
      metric: "mwr",
      message: "Opening or terminal valuation is unavailable.",
    });
    return result;
  }
  const investorFlows = capital.map((flow) => ({
    days: daysBetween(
      effectiveStart,
      flow.exact.gt(0) ? flow.date : addDays(flow.date, 1),
    ),
    amount: flow.exact.neg(),
  }));
  if (!opening.isZero()) investorFlows.push({ days: 0, amount: opening.neg() });
  if (!closing.isZero())
    investorFlows.push({ days: duration, amount: closing });
  try {
    const mwr = calculateMoneyWeightedReturn(investorFlows, duration);
    result.mwr = mwr.toNumber();
    if (duration >= 365)
      result.annualizedMwr = mwr
        .plus(1)
        .pow(toMoney(365).div(duration))
        .minus(1)
        .toNumber();
  } catch (error) {
    if (error instanceof ResourceLimitError) throw error;
    result.diagnostics.push({
      metric: "mwr",
      message:
        error instanceof Error
          ? error.message
          : "Money-weighted return is unavailable.",
    });
  }
  return result;
}
