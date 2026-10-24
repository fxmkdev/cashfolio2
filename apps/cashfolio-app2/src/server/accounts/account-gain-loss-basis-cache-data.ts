import Decimal from "decimal.js";
import { moneyIsFinite, toMoney, type Money } from "../../shared/money";
import { filterConvertibleHoldingAccounts } from "../period/period-helpers";
import type { AccountGainLossBasisRange } from "./account-gain-loss-range.server";

/** Only complete replay state is persisted; explanations and closing prices are excluded. */
export function toAccountGainLossBasisCacheData(
  range: AccountGainLossBasisRange,
) {
  return {
    ...range,
    basis: {
      holdings: range.basis.holdings.map(({ state }) => ({
        state: {
          account: { ...state.account },
          lots: state.lots.map((lot) => ({ ...lot })),
          realizedGainLoss: state.realizedGainLoss ?? toMoney(0),
          executionEvents: [],
          skipped: false,
        },
        diagnostics: [],
        unavailable: false,
      })),
    },
  } satisfies AccountGainLossBasisRange;
}

export function isCompleteAccountGainLossBasis(
  range: AccountGainLossBasisRange,
) {
  const holdingIds = new Set(
    range.basis.holdings.map(({ state }) => state.account.id),
  );
  return (
    range.basis.holdings.every(
      (holding) =>
        !holding.unavailable &&
        !holding.state.skipped &&
        holding.diagnostics.length === 0,
    ) &&
    range.accounts.every(
      (account) =>
        holdingIds.has(account.id) ||
        (account.unit === "CURRENCY" &&
          account.currency?.toUpperCase() === range.referenceCurrency),
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}
function isMoney(value: unknown): value is Money {
  return Decimal.isDecimal(value) && moneyIsFinite(value as Money);
}
function isHoldingMetadata(value: Record<string, unknown>) {
  return (
    typeof value.id === "string" &&
    (value.unit === null ||
      ["CURRENCY", "CRYPTOCURRENCY", "SECURITY"].includes(
        String(value.unit),
      )) &&
    [
      value.currency,
      value.cryptocurrency,
      value.symbol,
      value.tradeCurrency,
    ].every(isNullableString)
  );
}
function isAccountType(value: unknown) {
  return value === "ASSET" || value === "LIABILITY";
}
function isDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export function isAccountGainLossBasisCacheData(
  value: unknown,
): value is AccountGainLossBasisRange {
  if (
    !isRecord(value) ||
    typeof value.revision !== "string" ||
    typeof value.referenceCurrency !== "string" ||
    !isDate(value.startDate) ||
    typeof value.watermark !== "string" ||
    (value.watermark !== "empty" &&
      !Number.isFinite(Date.parse(value.watermark))) ||
    !Array.isArray(value.accounts) ||
    !value.accounts.every(
      (account: unknown) =>
        isRecord(account) &&
        isHoldingMetadata(account) &&
        typeof account.name === "string" &&
        isAccountType(account.type) &&
        typeof account.isActive === "boolean" &&
        isNullableString(account.groupId),
    ) ||
    !Array.isArray(value.groups) ||
    !value.groups.every(
      (group: unknown) =>
        isRecord(group) &&
        typeof group.id === "string" &&
        typeof group.isActive === "boolean" &&
        isNullableString(group.parentGroupId) &&
        (isAccountType(group.type) || group.type === "EQUITY"),
    ) ||
    !isRecord(value.basis) ||
    !Array.isArray(value.basis.holdings) ||
    !value.basis.holdings.every((holding: unknown) => {
      if (
        !isRecord(holding) ||
        holding.unavailable !== false ||
        !Array.isArray(holding.diagnostics) ||
        holding.diagnostics.length !== 0 ||
        !isRecord(holding.state)
      )
        return false;
      const state = holding.state;
      return (
        isRecord(state.account) &&
        isHoldingMetadata(state.account) &&
        state.account.unit !== null &&
        state.skipped === false &&
        isMoney(state.realizedGainLoss) &&
        Array.isArray(state.executionEvents) &&
        state.executionEvents.length === 0 &&
        state.processedExecutionEvents === undefined &&
        Array.isArray(state.lots) &&
        state.lots.every(
          (lot: unknown) =>
            isRecord(lot) &&
            isMoney(lot.quantity) &&
            isMoney(lot.unitCostInReference) &&
            typeof lot.acquisitionSortKey === "string",
        )
      );
    })
  )
    return false;

  const range = value as AccountGainLossBasisRange;
  const byId = new Map(range.accounts.map((account) => [account.id, account]));
  const expected = filterConvertibleHoldingAccounts(
    range.accounts,
    range.referenceCurrency,
  );
  const holdings = range.basis.holdings;
  return (
    byId.size === range.accounts.length &&
    new Set(holdings.map(({ state }) => state.account.id)).size ===
      holdings.length &&
    holdings.length === expected.length &&
    holdings.every(({ state }) => {
      const account = byId.get(state.account.id);
      return (
        account &&
        ["unit", "currency", "cryptocurrency", "symbol", "tradeCurrency"].every(
          (key) =>
            state.account[key as keyof typeof state.account] ===
            account[key as keyof typeof account],
        )
      );
    }) &&
    isCompleteAccountGainLossBasis(range)
  );
}
