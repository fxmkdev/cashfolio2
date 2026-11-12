import Decimal from "decimal.js";
import { toMoney } from "../../../shared/money";
import type {
  AccountReturnScope,
  AccountReturnTarget,
} from "../../../shared/accounts/account-returns";
import { loadAccountReturnInputs } from "./return-inputs.server";
import { returnArtifacts, returnArtifactId } from "./return-artifacts.server";
import {
  capitalRateRequests,
  createReturnEngine,
  returnTargets,
  returnRateKey,
  rateInput,
  rateRequest,
  type ReturnInputs,
  type ReturnRateRequest,
} from "./return-engine.server";

export type ReturnScopePlan = {
  key: string;
  accountIds: string[];
  applicable: boolean;
  requests: ReturnRateRequest[];
};
export type ReturnPlan = {
  revision: string;
  startDate: string;
  asOfDate: string;
  referenceCurrency: string;
  basisId: string;
  targets: {
    id: string;
    name: string;
    kind: "account" | "group" | "total";
    key: string;
  }[];
  scopes: ReturnScopePlan[];
};
type Basis = Omit<ReturnInputs, "initialBalances"> & {
  initialBalances: [string, ReturnType<typeof toMoney>][];
};
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
function isBasis(v: unknown): v is Basis {
  return (
    record(v) &&
    typeof v.revision === "string" &&
    typeof v.referenceCurrency === "string" &&
    typeof v.startDate === "string" &&
    typeof v.asOfDate === "string" &&
    Array.isArray(v.accounts) &&
    v.accounts.every(
      (a) =>
        record(a) &&
        typeof a.id === "string" &&
        typeof a.name === "string" &&
        typeof a.isActive === "boolean",
    ) &&
    Array.isArray(v.groups) &&
    Array.isArray(v.classes) &&
    Array.isArray(v.initialBalances) &&
    v.initialBalances.every(
      (b) =>
        Array.isArray(b) &&
        typeof b[0] === "string" &&
        Decimal.isDecimal(b[1]) &&
        b[1].isFinite(),
    ) &&
    Array.isArray(v.transactions) &&
    v.transactions.every(
      (t) =>
        record(t) &&
        Array.isArray(t.bookings) &&
        t.bookings.every(
          (b) =>
            record(b) &&
            typeof b.id === "string" &&
            typeof b.accountId === "string" &&
            b.date instanceof Date &&
            Number.isFinite(b.date.getTime()) &&
            Decimal.isDecimal(b.value) &&
            b.value.isFinite(),
        ),
    )
  );
}
export const isReturnPlan = (v: unknown): v is ReturnPlan =>
  record(v) &&
  typeof v.revision === "string" &&
  typeof v.basisId === "string" &&
  typeof v.asOfDate === "string" &&
  typeof v.startDate === "string" &&
  typeof v.referenceCurrency === "string" &&
  Array.isArray(v.targets) &&
  Array.isArray(v.scopes) &&
  v.targets.every(
    (t) =>
      record(t) &&
      typeof t.id === "string" &&
      typeof t.name === "string" &&
      typeof t.key === "string" &&
      ["account", "group", "total"].includes(String(t.kind)),
  ) &&
  v.scopes.every(
    (s) =>
      record(s) &&
      typeof s.key === "string" &&
      typeof s.applicable === "boolean" &&
      Array.isArray(s.accountIds) &&
      s.accountIds.every((id) => typeof id === "string") &&
      Array.isArray(s.requests) &&
      s.requests.every(
        (r) =>
          record(r) &&
          ["CURRENCY", "CRYPTOCURRENCY", "SECURITY"].includes(String(r.unit)) &&
          typeof r.date === "string",
      ),
  );
const decodedBases = new WeakMap<Basis, ReturnInputs>();
export async function readReturnBasis(accountBookId: string, id: string) {
  const basis = await (await returnArtifacts(accountBookId)).read(id, isBasis);
  if (!basis) return;
  let inputs = decodedBases.get(basis);
  if (!inputs) {
    inputs = { ...basis, initialBalances: new Map(basis.initialBalances) };
    decodedBases.set(basis, inputs);
  }
  return inputs;
}
const transactionIndex = new WeakMap<ReturnInputs, Map<string, number[]>>();
export function scopeInputs(
  inputs: ReturnInputs,
  accountIds: Set<string>,
): ReturnInputs {
  let index = transactionIndex.get(inputs);
  if (!index) {
    index = new Map();
    inputs.transactions.forEach((tx, i) => {
      for (const id of new Set(tx.bookings.map((b) => b.accountId))) {
        const list = index!.get(id) ?? [];
        list.push(i);
        index!.set(id, list);
      }
    });
    transactionIndex.set(inputs, index);
  }
  const positions = new Set(
    [...accountIds].flatMap((id) => index!.get(id) ?? []),
  );
  return {
    ...inputs,
    transactions: [...positions]
      .sort((a, b) => a - b)
      .map((i) => inputs.transactions[i]!),
  };
}
export async function getReturnPlan(
  args: AccountReturnScope & {
    target?: AccountReturnTarget;
    period?: string;
    includeDetails?: boolean;
  },
  revision: string,
  asOfDate: string,
  publication: string,
) {
  const artifacts = await returnArtifacts(args.accountBookId);
  const id = returnArtifactId([
    "plan-v1",
    revision,
    asOfDate,
    publication,
    args.accountState,
    args.grouping,
    args.target ?? null,
  ]);
  const cached = await artifacts.read(id, isReturnPlan);
  if (cached && (await readReturnBasis(args.accountBookId, cached.basisId)))
    return { id, plan: cached };
  const basisId = returnArtifactId([
    "basis-v1",
    revision,
    asOfDate,
    args.target?.kind === "account" ? args.target.id : null,
  ]);
  let inputs = await readReturnBasis(args.accountBookId, basisId);
  if (!inputs) {
    inputs = await loadAccountReturnInputs(
      args.accountBookId,
      new Date(`${asOfDate}T00:00:00Z`),
      args.target?.kind === "account" ? args.target.id : undefined,
    );
    if (inputs.revision !== revision) return;
    await artifacts.save(
      basisId,
      { ...inputs, initialBalances: [...inputs.initialBalances] },
      Date.now() + 86400_000,
    );
  }
  const targets = returnTargets(inputs, args, args.target);
  const scopes = new Map<string, ReturnScopePlan>();
  const mapped = [];
  for (const target of targets) {
    const accountIds = [...target.accountIds].sort();
    const key = returnArtifactId(accountIds);
    mapped.push({ id: target.id, name: target.name, kind: target.kind, key });
    if (scopes.has(key)) continue;
    const subset = scopeInputs(inputs, target.accountIds);
    const engine = await createReturnEngine(subset, async () => toMoney(1));
    const requests = new Map(
      capitalRateRequests(subset).map((r) => [returnRateKey(rateInput(r)), r]),
    );
    const draft = await engine.calculate(
      target,
      async (input) => {
        if (!(
          input.unit === "CURRENCY" &&
          input.currency?.toUpperCase() === inputs.referenceCurrency
        ))
          requests.set(returnRateKey(input), rateRequest(input));
        return toMoney(1);
      },
      true,
    );
    scopes.set(key, {
      key,
      accountIds,
      applicable: draft.applicable,
      requests: draft.applicable ? [...requests.values()] : [],
    });
  }
  const plan: ReturnPlan = {
    revision,
    startDate: inputs.startDate,
    asOfDate,
    referenceCurrency: inputs.referenceCurrency,
    basisId,
    targets: mapped,
    scopes: [...scopes.values()].sort(
      (a, b) =>
        a.requests.length - b.requests.length ||
        Number(b.applicable) - Number(a.applicable) ||
        a.accountIds.length - b.accountIds.length,
    ),
  };
  await artifacts.save(id, plan, Date.now() + 86400_000);
  return { id, plan };
}
