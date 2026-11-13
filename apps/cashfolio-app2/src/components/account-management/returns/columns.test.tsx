import type { ColDef, ValueGetterParams } from "ag-grid-enterprise";
import { expect, it } from "vitest";
import { buildAccountReturnColumns } from "./columns";
import {
  createAccountRow,
  createGroupRow,
  footerRow,
} from "../grid/column-test-fixtures";
import type { AccountsGridRow } from "../grid/rows";
import type {
  AccountReturnBasis,
  AccountReturnSummaries,
} from "@/shared/accounts/account-returns";
import { emptyAccountReturnResult } from "@/shared/accounts/account-returns";

const growth = {
  ...emptyAccountReturnResult(),
  twr: 0.21,
  mwr: 0.3,
  annualizedTwr: 0.1,
  annualizedMwr: 0.15,
};
const summary: AccountReturnSummaries = {
  referenceCurrency: "CHF",
  startDate: "2024-01-01",
  asOfDate: "2026-01-01",
  rows: [
    { ...growth, id: "account-1" },
    { ...growth, id: "group-1" },
    { ...growth, id: "archived" },
    { ...growth, id: "other", twr: 0.5, annualizedTwr: 0.05 },
  ],
  total: growth,
};

function readValue(column: ColDef<AccountsGridRow>, row: AccountsGridRow) {
  if (typeof column.valueGetter !== "function")
    throw new Error("Missing return getter");
  return column.valueGetter({
    data: row,
  } as ValueGetterParams<AccountsGridRow>);
}

it.each(["annualized", "cumulative"] as const)(
  "uses %s values for accounts, groups, archived accounts and the footer",
  (basis: AccountReturnBasis) => {
    const group = buildAccountReturnColumns({
      data: summary,
      basis,
      locale: "en-US",
    });
    expect(group.headerName).toBe(
      `Returns Since Start (${basis === "annualized" ? "Annualized" : "Cumulative"})`,
    );
    const columns = group.children as ColDef<AccountsGridRow>[];
    for (const row of [
      createAccountRow(),
      createGroupRow(),
      createAccountRow({ id: "archived", isActive: false }),
      footerRow,
    ]) {
      expect(readValue(columns[0], row)).toBe(
        basis === "annualized" ? 0.1 : 0.21,
      );
      expect(readValue(columns[1], row)).toBe(
        basis === "annualized" ? 0.15 : 0.3,
      );
    }
  },
);

it("defaults to annualized and supplies the selected raw numbers for sorting", () => {
  const annualized = buildAccountReturnColumns({
    data: summary,
    locale: "en-US",
  }).children[0] as ColDef<AccountsGridRow>;
  const cumulative = buildAccountReturnColumns({
    data: summary,
    basis: "cumulative",
    locale: "en-US",
  }).children[0] as ColDef<AccountsGridRow>;
  const rows = [createAccountRow(), createAccountRow({ id: "other" })];
  expect(rows.map((row) => readValue(annualized, row))).toEqual([0.1, 0.05]);
  expect(rows.map((row) => readValue(cumulative, row))).toEqual([0.21, 0.5]);
});
