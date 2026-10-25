import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "@/.prisma-client/enums";
import type { AccountOption } from "@/shared/account-options";
import {
  getStatementImportDraftStatus,
  type StatementImportCsvRow,
  type StatementImportDraft,
} from "./index";

export const currentAccount = {
  id: "asset-1",
  unit: Unit.CURRENCY,
  currency: "CHF",
  cryptocurrency: null,
  symbol: null,
  tradeCurrency: null,
};

export const accountBookStartDate = new Date("2026-01-01T00:00:00.000Z");

export const accountOptions: AccountOption[] = [
  {
    value: "asset-1",
    label: "Checking",
    unit: Unit.CURRENCY,
    currency: "CHF",
    type: AccountType.BALANCE,
  },
  {
    value: "income-1",
    label: "Salary",
    unit: null,
    type: AccountType.EQUITY,
    equityAccountSubtype: EquityAccountSubtype.INCOME,
  },
  {
    value: "expense-1",
    label: "Groceries",
    unit: null,
    type: AccountType.EQUITY,
    equityAccountSubtype: EquityAccountSubtype.EXPENSE,
  },
  {
    value: "asset-usd",
    label: "USD Cash",
    unit: Unit.CURRENCY,
    currency: "USD",
    type: AccountType.BALANCE,
  },
];

export function createRow(
  overrides: Partial<StatementImportCsvRow> = {},
): StatementImportCsvRow {
  return {
    date: "2026-02-03",
    amount: "100.25",
    "original amount": "92.50",
    "original currency": "EUR",
    "exchange rate": "1.083784",
    description: "Transfer",
    ...overrides,
  };
}

export function getImportDraftStatus(draft: StatementImportDraft) {
  return getStatementImportDraftStatus({
    draft,
    accounts: accountOptions,
    accountBookStartDate,
  });
}
