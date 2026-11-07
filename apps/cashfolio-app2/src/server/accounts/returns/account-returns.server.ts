import type {
  AccountReturnScope,
  AccountReturnTarget,
  AccountReturnSummaries,
} from "../../../shared/account-returns";
import { buildAccountReturnGroups } from "../../../shared/account-return-groups";
import {
  getUnitToReferenceExchangeRateDetails,
  convertBookingValueToReferenceDetails,
} from "../../period/period-conversion";
import type {
  DecimalValuationRateLookupResult,
  ValuationRateSource,
} from "../../valuation/types";
import { createAccountGainLossLookupScheduler } from "../account-gain-loss-prefetch.server";
import { resolveAccountGainLossDate } from "../account-gain-loss-range.server";
import { loadAccountReturnInputs } from "./return-inputs.server";
import { prepareReturnTransactions } from "./return-transactions";
import { calculateAccountReturns } from "./return-calculation";
import { getOrLoadAccountReturnSummaries } from "./return-cache.server";

async function prepare(accountBookId: string, period?: string) {
  const inputs = await loadAccountReturnInputs(
    accountBookId,
    resolveAccountGainLossDate(period),
  );
  const exchangeRateByKey = new Map<
    string,
    Promise<DecimalValuationRateLookupResult>
  >();
  const scheduleLookup = createAccountGainLossLookupScheduler();
  let cacheable = true;
  const mark = (source: ValuationRateSource) => {
    if (source !== "identity" && source !== "timeSeries") cacheable = false;
  };
  const conversionContext = {
    referenceCurrency: inputs.referenceCurrency,
    exchangeRateByKey,
    scheduleLookup,
  };
  const prepared = await prepareReturnTransactions({
    ...inputs,
    convert: async (booking) => {
      const result = await convertBookingValueToReferenceDetails({
        ...booking,
        ...conversionContext,
      });
      mark(result.source);
      return result.value;
    },
  });
  const eligible = (id: string) => {
    const account = inputs.accounts.find((item) => item.id === id)!;
    return (
      !(
        account.unit === "CURRENCY" &&
        account.currency?.toUpperCase() === inputs.referenceCurrency
      ) || prepared.recordedAccountIds.has(id)
    );
  };
  const calculations = new Map<
    string,
    ReturnType<typeof calculateAccountReturns>
  >();
  const calculate = async (name: string, ids: Set<string>) => {
    const key = JSON.stringify([...ids].sort());
    let calculation = calculations.get(key);
    if (!calculation) {
      calculation = calculateAccountReturns({
        ...inputs,
        name,
        accounts: inputs.accounts.filter((account) => ids.has(account.id)),
        applicable: [...ids].some(eligible),
        prepared,
        resolveRate: async (identity) => {
          const result = await getUnitToReferenceExchangeRateDetails({
            ...identity,
            ...conversionContext,
          });
          mark(result.source);
          return result.rate;
        },
      });
      calculations.set(key, calculation);
    }
    return { ...(await calculation), name };
  };
  return {
    inputs,
    cacheable: () => cacheable,
    calculate,
  };
}

export async function loadAccountReturnSummaries(scope: AccountReturnScope) {
  const context = await prepare(scope.accountBookId);
  const accounts = context.inputs.accounts.filter(
    (account) =>
      scope.accountState === "all" ||
      account.isActive === (scope.accountState === "active"),
  );
  const groups = buildAccountReturnGroups({
    ...context.inputs,
    accounts,
    grouping: scope.grouping,
  });
  const stripDetails = ({
    name: _name,
    referenceCurrency: _currency,
    startDate: _start,
    asOfDate: _asOf,
    valuations: _valuations,
    cashFlows: _flows,
    ...result
  }: Awaited<ReturnType<typeof context.calculate>>) => result;
  const rows: AccountReturnSummaries["rows"] = [];
  for (const account of accounts)
    rows.push({
      id: account.id,
      ...stripDetails(
        await context.calculate(account.name, new Set([account.id])),
      ),
    });
  for (const [id, group] of groups)
    rows.push({
      id,
      ...stripDetails(await context.calculate(group.name, group.accountIds)),
    });
  const total = stripDetails(
    await context.calculate(
      "Total",
      new Set(accounts.map((account) => account.id)),
    ),
  );
  return {
    revision: context.inputs.revision,
    cacheable: context.cacheable(),
    data: {
      rows,
      total,
      referenceCurrency: context.inputs.referenceCurrency,
      startDate: context.inputs.startDate,
      asOfDate: context.inputs.asOfDate,
    },
  };
}

export const queryAccountReturnSummaries = (scope: AccountReturnScope) =>
  getOrLoadAccountReturnSummaries(scope, () =>
    loadAccountReturnSummaries(scope),
  );

export async function queryAccountReturnDetails(
  args: AccountReturnScope & { target: AccountReturnTarget; period?: string },
) {
  if (args.period && args.target.kind !== "account")
    throw new Error(
      "Period selection is supported for individual accounts only.",
    );
  const context = await prepare(args.accountBookId, args.period);
  if (args.target.kind === "account") {
    const id = args.target.id;
    const account = context.inputs.accounts.find((item) => item.id === id);
    if (!account) throw new Error("Account not found");
    return context.calculate(account.name, new Set([account.id]));
  }
  const accounts = context.inputs.accounts.filter(
    (account) =>
      args.accountState === "all" ||
      account.isActive === (args.accountState === "active"),
  );
  if (args.target.kind === "total")
    return context.calculate(
      "Total",
      new Set(accounts.map((account) => account.id)),
    );
  const group = buildAccountReturnGroups({
    ...context.inputs,
    accounts,
    grouping: args.grouping,
  }).get(args.target.id);
  if (!group) throw new Error("Group not found");
  return context.calculate(group.name, group.accountIds);
}
