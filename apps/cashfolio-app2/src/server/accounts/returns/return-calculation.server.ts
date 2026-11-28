import { toMoney, type Money } from "../../../shared/money";
import { Temporal } from "../../../shared/temporal";
import {
  emptyAccountReturnResult,
  type AccountReturnDetails,
  type AccountReturnCashFlow,
} from "../../../shared/accounts/account-returns";
import type { ReturnAccount } from "../../../shared/accounts/account-return-groups";
import type { HoldingRateResolver } from "../../holdings/types";
import type { PreparedReturnTransactions } from "./return-transaction-types";
import { calculateMoneyWeightedReturn } from "./return-irr.server";
import { ResourceLimitError } from "../../resource-error";
import { createReturnScopeValuer } from "./return-valuation.server";

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
  includeDetails?: boolean;
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
  if (args.includeDetails && !args.valuationOnly)
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
  let negative = false;
  let effectiveStart: string | null = opening?.gt(0) ? startDate : null;
  let effectiveEnd: string | null = null;
  const snapshots = new Map<
    string,
    AccountReturnDetails["valuations"][number]
  >();
  const snapshot = (date: string, value: Money | null) => {
    if (args.includeDetails && !args.valuationOnly)
      snapshots.set(date, {
        id: date,
        date,
        kind:
          date === addDays(startDate, -1)
            ? "opening"
            : date === asOfDate
              ? "closing"
              : "intermediate",
        value: numeric(value),
      });
  };
  snapshot(previousDate, opening);
  snapshot(asOfDate, closing);
  const observe = (
    date: string,
    begin: Money | null,
    end: Money | null,
    hasMovement: boolean,
  ) => {
    if (begin?.gt(0) || end?.gt(0) || hasMovement) effectiveEnd = date;
    if (begin?.lt(0) || end?.lt(0)) negative = true;
    snapshot(date, end);
  };
  for (const date of eventDays) {
    const before = addDays(date, -1);
    if (before > previousDate) {
      const end = await valueAt(before);
      observe(before, previous, end, false);
      previous = end;
    }
    const movements = capital.filter((flow) => flow.date === date);
    const end = await valueAt(date);
    if (!effectiveStart && movements.some((flow) => flow.exact.gt(0)))
      effectiveStart = date;
    observe(date, previous, end, movements.length > 0);
    previous = end;
    previousDate = date;
  }
  if (args.includeDetails && !args.valuationOnly)
    result.valuations = [...snapshots.values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
  result.effectiveStartDate = effectiveStart;
  result.effectiveEndDate = closing?.gt(0) ? asOfDate : effectiveEnd;
  if (args.valuationOnly) return result;
  if (negative) {
    result.diagnostics = [
      {
        message:
          "Returns are unavailable when invested value becomes negative.",
      },
    ];
    return result;
  }
  if (!effectiveStart || !result.effectiveEndDate) {
    result.diagnostics.push({
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
  if (opening === null || closing === null) {
    result.diagnostics.push({
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
      message:
        error instanceof Error
          ? error.message
          : "Money-weighted return is unavailable.",
    });
  }
  return result;
}
