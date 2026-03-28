import { describe, expect, it } from "vitest";
import { AccountType, Unit } from "../../.prisma-client/enums";
import type { GroupBalanceAggregation } from "./-accounts-page-data";
import type { AccountsGridRow } from "./-accounts-page-types";
import {
  REFERENCE_BALANCES_LOADING_DELAY_MS,
  shouldShowReferenceBalanceLoadingIndicator,
} from "./-reference-balance-loading";

function createAccountRow(
  balanceInReferenceCurrency: number | null,
): AccountsGridRow {
  return {
    id: "account-1",
    nodeType: "account",
    name: "Cash",
    type: AccountType.ASSET,
    equityAccountSubtype: null,
    unit: Unit.CURRENCY,
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    balance: 10,
    balanceInReferenceCurrency,
    parentId: undefined,
    isActive: true,
    groupId: undefined,
    sortOrder: 1,
    deletable: true,
    deleteDisabledReason: undefined,
    archivable: true,
    archiveDisabledReason: undefined,
    unarchivable: true,
    unarchiveDisabledReason: undefined,
  };
}

function createGroupRow(): AccountsGridRow {
  return {
    id: "group-1",
    nodeType: "accountGroup",
    name: "Assets",
    type: AccountType.ASSET,
    equityAccountSubtype: null,
    unit: null,
    currency: null,
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    balance: null,
    balanceInReferenceCurrency: null,
    parentId: undefined,
    isActive: true,
    groupId: "group-1",
    sortOrder: 1,
    deletable: true,
    deleteDisabledReason: undefined,
    archivable: true,
    archiveDisabledReason: undefined,
    unarchivable: true,
    unarchiveDisabledReason: undefined,
  };
}

describe("reference-balance-loading", () => {
  it("uses a 100ms delay to avoid loader flicker", () => {
    expect(REFERENCE_BALANCES_LOADING_DELAY_MS).toBe(100);
  });

  it("shows loader for unresolved account values while loading", () => {
    expect(
      shouldShowReferenceBalanceLoadingIndicator({
        data: createAccountRow(null),
        isReferenceBalancesLoading: true,
        balanceInReferenceCurrencyByGroupId: new Map(),
      }),
    ).toBe(true);

    expect(
      shouldShowReferenceBalanceLoadingIndicator({
        data: createAccountRow(10),
        isReferenceBalancesLoading: true,
        balanceInReferenceCurrencyByGroupId: new Map(),
      }),
    ).toBe(false);
  });

  it("shows loader for unresolved footer total while loading", () => {
    expect(
      shouldShowReferenceBalanceLoadingIndicator({
        data: {
          id: "__reference_currency_total_footer__",
          rowType: "referenceCurrencyTotalFooter",
          name: "Total",
          balanceInReferenceCurrency: null,
        },
        isReferenceBalancesLoading: true,
        balanceInReferenceCurrencyByGroupId: new Map(),
      }),
    ).toBe(true);

    expect(
      shouldShowReferenceBalanceLoadingIndicator({
        data: {
          id: "__reference_currency_total_footer__",
          rowType: "referenceCurrencyTotalFooter",
          name: "Total",
          balanceInReferenceCurrency: null,
        },
        isReferenceBalancesLoading: false,
        balanceInReferenceCurrencyByGroupId: new Map(),
      }),
    ).toBe(false);
  });

  it("shows loader for groups only when account descendants are unresolved", () => {
    const groupRow = createGroupRow();
    const loadingAggregation: GroupBalanceAggregation = {
      sum: 0,
      hasAccountDescendants: true,
      hasMissingReferenceBalance: true,
    };
    const resolvedAggregation: GroupBalanceAggregation = {
      sum: 5,
      hasAccountDescendants: true,
      hasMissingReferenceBalance: false,
    };

    expect(
      shouldShowReferenceBalanceLoadingIndicator({
        data: groupRow,
        isReferenceBalancesLoading: true,
        balanceInReferenceCurrencyByGroupId: new Map([
          [groupRow.id, loadingAggregation],
        ]),
      }),
    ).toBe(true);

    expect(
      shouldShowReferenceBalanceLoadingIndicator({
        data: groupRow,
        isReferenceBalancesLoading: true,
        balanceInReferenceCurrencyByGroupId: new Map([
          [groupRow.id, resolvedAggregation],
        ]),
      }),
    ).toBe(false);
  });
});
