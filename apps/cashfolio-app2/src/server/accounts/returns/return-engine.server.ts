import type {
  AccountReturnDetails,
  AccountReturnScope,
  AccountReturnTarget,
} from "../../../shared/accounts/account-returns";
import {
  buildAccountReturnGroups,
  type ReturnAccount,
} from "../../../shared/accounts/account-return-groups";
import { toMoney } from "../../../shared/money";
import type { HoldingRateResolver } from "../../holdings/types";
import type { loadAccountReturnInputs } from "./return-inputs.server";
import { prepareReturnTransactions } from "./return-transactions.server";
import { calculateAccountReturns } from "./return-calculation.server";

export type ReturnInputs = Omit<
  Awaited<ReturnType<typeof loadAccountReturnInputs>>,
  "accounts"
> & { accounts: ReturnAccount[] };
export type ReturnRateInput = Parameters<HoldingRateResolver>[0];
export type ReturnRateRequest = Omit<ReturnRateInput, "date"> & {
  date: string;
};
export const returnRateKey = (input: ReturnRateInput) =>
  JSON.stringify([
    input.unit,
    input.currency?.toUpperCase() ?? null,
    input.cryptocurrency?.toUpperCase() ?? null,
    input.symbol?.toUpperCase() ?? null,
    input.tradeCurrency?.toUpperCase() ?? null,
    input.date.toISOString().slice(0, 10),
  ]);
export const rateInput = (request: ReturnRateRequest): ReturnRateInput => ({
  ...request,
  date: new Date(`${request.date}T00:00:00Z`),
});
export const rateRequest = (input: ReturnRateInput): ReturnRateRequest => ({
  unit: input.unit,
  currency: input.currency,
  cryptocurrency: input.cryptocurrency,
  symbol: input.symbol,
  tradeCurrency: input.tradeCurrency,
  date: input.date.toISOString().slice(0, 10),
});
export const stripReturnDetails = ({
  name: _name,
  referenceCurrency: _currency,
  startDate: _start,
  asOfDate: _asOf,
  valuations: _valuations,
  cashFlows: _flows,
  ...result
}: AccountReturnDetails) => result;

export function returnTargets(
  inputs: ReturnInputs,
  scope: AccountReturnScope,
  target?: AccountReturnTarget,
) {
  const accounts = inputs.accounts.filter(
    (a) =>
      scope.accountState === "all" ||
      a.isActive === (scope.accountState === "active"),
  );
  const groups = buildAccountReturnGroups({
    ...inputs,
    accounts,
    grouping: scope.grouping,
  });
  const targets = [
    ...accounts.map((a) => ({
      id: a.id,
      name: a.name,
      accountIds: new Set([a.id]),
      kind: "account" as const,
    })),
    ...[...groups].map(([id, g]) => ({ id, ...g, kind: "group" as const })),
    {
      id: "__return_total__",
      name: "Total",
      accountIds: new Set(accounts.map((a) => a.id)),
      kind: "total" as const,
    },
  ];
  if (!target) return targets;
  // Ledger eligibility does not depend on the account-list state filter.
  if (target.kind === "account") {
    const a = inputs.accounts.find((a) => a.id === target.id);
    if (!a) throw new Error("Account not found");
    return [
      {
        id: a.id,
        name: a.name,
        accountIds: new Set([a.id]),
        kind: "account" as const,
      },
    ];
  }
  const selected = targets.find(
    (t) =>
      t.kind === target.kind && (target.kind === "total" || t.id === target.id),
  );
  if (!selected) throw new Error("Group not found");
  return [selected];
}

export async function createReturnEngine(
  inputs: ReturnInputs,
  resolveRate: HoldingRateResolver,
) {
  const prepared = await prepareReturnTransactions({
    ...inputs,
    convert: async (booking) => {
      if (booking.value.isZero()) return toMoney(0);
      const rate = await resolveRate(booking);
      return rate === null ? null : booking.value.mul(rate);
    },
  });
  const eligible = (id: string) => {
    const a = inputs.accounts.find((a) => a.id === id)!;
    return (
      !(
        a.unit === "CURRENCY" &&
        a.currency?.toUpperCase() === inputs.referenceCurrency
      ) || prepared.recordedAccountIds.has(id)
    );
  };
  const calculate = (
    target: ReturnType<typeof returnTargets>[number],
    rate = resolveRate,
    valuationOnly = false,
  ) =>
    calculateAccountReturns({
      ...inputs,
      ...target,
      accounts: inputs.accounts.filter((a) => target.accountIds.has(a.id)),
      applicable: [...target.accountIds].some(eligible),
      prepared,
      resolveRate: rate,
      valuationOnly,
    });
  return { calculate };
}

/** Conservative capital lookup plan: retain transaction peers and dated G/L metadata. */
export function capitalRateRequests(inputs: ReturnInputs) {
  const requests = new Map<string, ReturnRateRequest>();
  const add = (input: ReturnRateInput) => {
    const date = input.date.toISOString().slice(0, 10);
    if (date < inputs.startDate || date > inputs.asOfDate) return;
    if (
      input.unit === "CURRENCY" &&
      input.currency?.toUpperCase() === inputs.referenceCurrency
    )
      return;
    requests.set(returnRateKey(input), rateRequest(input));
  };
  for (const tx of inputs.transactions) {
    for (const booking of tx.bookings)
      if (!booking.value.isZero()) add(booking);
    const gain = tx.bookings.find(
      (b) => b.equityAccountSubtype === "GAIN_LOSS",
    );
    if (gain)
      for (const peer of tx.bookings.filter((b) => b.accountType === "BALANCE"))
        add({ ...gain, date: peer.date });
  }
  return [...requests.values()];
}
