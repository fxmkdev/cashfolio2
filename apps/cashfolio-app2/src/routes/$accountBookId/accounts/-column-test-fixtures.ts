import { AccountType, Unit } from "@/.prisma-client/enums";
import type { AccountsGridRow, TreeRow } from "./-page-types";
export function createAccountRow(overrides: Partial<TreeRow> = {}): TreeRow {
  return {
    id: "account-1",
    nodeType: "account",
    name: "Cash",
    type: AccountType.BALANCE,
    equityAccountSubtype: null,
    unit: Unit.CURRENCY,
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    balance: 10,
    balanceInReferenceCurrency: 10,
    openingBalance: null,
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
    ...overrides,
  };
}

export function createGroupRow(): TreeRow {
  return {
    id: "group-1",
    nodeType: "accountGroup",
    name: "Assets",
    type: AccountType.BALANCE,
    equityAccountSubtype: null,
    unit: null,
    currency: null,
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    balance: null,
    balanceInReferenceCurrency: null,
    openingBalance: null,
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

export const footerRow: AccountsGridRow = {
  id: "__reference_currency_total_footer__",
  rowType: "referenceCurrencyTotalFooter",
  name: "Total",
  balanceInReferenceCurrency: 10,
};
