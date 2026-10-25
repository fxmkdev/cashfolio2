import Decimal from "decimal.js";
import { moneyIsFinite, type Money } from "../../shared/money";
import type { AccountGainLossResult } from "../../shared/account-gain-loss";
import type { loadAccountGainLossRange } from "./account-gain-loss-range.server";

type Range = Awaited<ReturnType<typeof loadAccountGainLossRange>>;

/** Only leaf results and view metadata; no transactions or calculation details. */
export function toAccountGainLossCacheData(range: Range) {
  return {
    accounts: range.accounts.map(({ id, type, isActive, groupId }) => ({
      id,
      type,
      isActive,
      groupId,
      result: range.results.get(id)!,
    })),
    groups: range.groups,
    referenceCurrency: range.referenceCurrency,
    startDate: range.startDate,
    asOfDate: range.asOfDate,
  };
}

export type AccountGainLossCacheData = ReturnType<
  typeof toAccountGainLossCacheData
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isAmount(value: unknown): value is Money | null {
  return (
    value === null ||
    (Decimal.isDecimal(value) && moneyIsFinite(value as Money))
  );
}

function isResult(value: unknown): value is AccountGainLossResult<Money> {
  return (
    isRecord(value) &&
    typeof value.applicable === "boolean" &&
    isRecord(value.summary) &&
    isAmount(value.summary.realizedGainLoss) &&
    isAmount(value.summary.unrealizedGainLoss) &&
    isAmount(value.summary.totalGainLoss) &&
    Array.isArray(value.diagnostics) &&
    value.diagnostics.every(
      (item: unknown) =>
        isRecord(item) && isDate(item.date) && typeof item.message === "string",
    )
  );
}

export function isAccountGainLossCacheData(
  value: unknown,
): value is AccountGainLossCacheData {
  return (
    isRecord(value) &&
    typeof value.referenceCurrency === "string" &&
    isDate(value.startDate) &&
    isDate(value.asOfDate) &&
    Array.isArray(value.accounts) &&
    value.accounts.every(
      (account: unknown) =>
        isRecord(account) &&
        typeof account.id === "string" &&
        account.type === "BALANCE" &&
        typeof account.isActive === "boolean" &&
        isNullableString(account.groupId) &&
        isResult(account.result),
    ) &&
    Array.isArray(value.groups) &&
    value.groups.every(
      (group: unknown) =>
        isRecord(group) &&
        typeof group.id === "string" &&
        typeof group.isActive === "boolean" &&
        (group.type === "BALANCE" || group.type === "EQUITY") &&
        isNullableString(group.parentGroupId),
    )
  );
}
