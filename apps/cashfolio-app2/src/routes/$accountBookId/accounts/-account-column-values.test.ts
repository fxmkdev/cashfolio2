import { defaultAssetClassIds } from "../../../shared/asset-class";
import { describe, expect, it } from "vitest";
import { AccountType, Unit } from "@/.prisma-client/enums";
import {
  getAccountListBalanceValue,
  getAccountListUnitIdentifierDisplayValue,
  getAccountListAssetClassValue,
  getAccountListTrackingMethodValue,
} from "./-account-column-values";
import {
  createAccountRow,
  createGroupRow,
  footerRow,
} from "./-column-test-fixtures";
describe("account list column value getters", () => {
  it.each([
    ["INDIVIDUAL_UNITS", "Individual Units"],
    ["TOTAL_PORTFOLIO_VALUE", "Total Value"],
    [undefined, "Individual Units"],
  ] as const)(
    "displays tracking method %s on active and archived accounts",
    (trackingMethod, label) => {
      for (const isActive of [true, false]) {
        expect(
          getAccountListTrackingMethodValue(
            createAccountRow({ trackingMethod, isActive }),
          ),
        ).toBe(label);
      }
    },
  );

  it.each([Unit.SECURITY, Unit.CRYPTOCURRENCY])(
    "displays Individual Units for %s",
    (unit) => {
      expect(
        getAccountListTrackingMethodValue(createAccountRow({ unit })),
      ).toBe("Individual Units");
    },
  );

  it.each([
    ["INDIVIDUAL_UNITS", "Individual Units"],
    ["TOTAL_PORTFOLIO_VALUE", "Total Value"],
    ["Mixed", "Mixed"],
    [undefined, undefined],
  ] as const)(
    "displays group tracking method %s",
    (groupTrackingMethod, label) => {
      for (const isVirtualArchivedGroup of [true, false]) {
        expect(
          getAccountListTrackingMethodValue({
            ...createGroupRow(),
            groupTrackingMethod,
            isVirtualArchivedGroup,
          }),
        ).toBe(label);
      }
    },
  );

  it("leaves tracking method blank for totals and missing rows", () => {
    expect(getAccountListTrackingMethodValue(footerRow)).toBeUndefined();
    expect(getAccountListTrackingMethodValue(undefined)).toBeUndefined();
  });

  it.each([
    [defaultAssetClassIds.CASH_AND_CASH_EQUIVALENTS, "Cash & Cash Equivalents"],
    [defaultAssetClassIds.EQUITIES, "Equities"],
    [defaultAssetClassIds.FIXED_INCOME, "Fixed Income"],
    [defaultAssetClassIds.REAL_ESTATE, "Real Estate"],

    [
      defaultAssetClassIds.COMMODITIES_AND_PRECIOUS_METALS,
      "Commodities & Precious Metals",
    ],
    [defaultAssetClassIds.DIGITAL_ASSETS, "Digital Assets"],
    [defaultAssetClassIds.ALTERNATIVE_INVESTMENTS, "Alternative Investments"],
    [defaultAssetClassIds.OTHER_ASSETS, "Other Assets"],
    [null, "Unclassified"],
    [undefined, "Unclassified"],
  ] as const)("displays %s using its shared label", (assetClassId, label) => {
    for (const type of [AccountType.BALANCE]) {
      for (const isActive of [true, false]) {
        expect(
          getAccountListAssetClassValue(
            createAccountRow({ assetClassId, type, isActive }),
          ),
        ).toBe(label);
      }
    }
  });

  it.each([
    [defaultAssetClassIds.EQUITIES, "Equities"],
    [null, "Unclassified"],
    ["Mixed", "Mixed"],
  ] as const)("displays group summary %s as %s", (groupAssetClass, label) => {
    for (const isVirtualArchivedGroup of [true, false]) {
      expect(
        getAccountListAssetClassValue({
          ...createGroupRow(),
          groupAssetClass,
          isVirtualArchivedGroup,
        }),
      ).toBe(label);
    }
  });

  it("leaves empty groups, totals, and missing data blank", () => {
    for (const row of [
      createGroupRow(),
      { ...createGroupRow(), isVirtualArchivedGroup: true },
      footerRow,
      undefined,
    ]) {
      expect(getAccountListAssetClassValue(row)).toBeUndefined();
    }
  });

  it.each([true, false])(
    "hides native currency and balance for reference-currency cash accounts (active=%s)",
    (isActive) => {
      const row = createAccountRow({
        currency: "CHF",
        balance: 10,
        isActive,
      });

      expect(
        getAccountListUnitIdentifierDisplayValue({
          data: row,
          referenceCurrency: "CHF",
        }),
      ).toBeUndefined();
      expect(
        getAccountListBalanceValue({
          data: row,
          referenceCurrency: "CHF",
        }),
      ).toBeNull();
    },
  );

  it.each([true, false])(
    "keeps native currency and balance for non-reference-currency cash accounts (active=%s)",
    (isActive) => {
      const row = createAccountRow({
        currency: "USD",
        balance: 20,
        isActive,
      });

      expect(
        getAccountListUnitIdentifierDisplayValue({
          data: row,
          referenceCurrency: "CHF",
        }),
      ).toBe("USD");
      expect(
        getAccountListBalanceValue({
          data: row,
          referenceCurrency: "CHF",
        }),
      ).toBe(20);
    },
  );

  it.each(["CHF", "USD"])(
    "shows security symbols and quantities with %s trade currency",
    (tradeCurrency) => {
      for (const isActive of [true, false]) {
        const row = createAccountRow({
          unit: Unit.SECURITY,
          currency: null,
          tradeCurrency,
          symbol: "ACME",
          balance: 5,
          isActive,
        });

        expect(
          getAccountListUnitIdentifierDisplayValue({
            data: row,
            referenceCurrency: "CHF",
          }),
        ).toBe("ACME");
        expect(
          getAccountListBalanceValue({
            data: row,
            referenceCurrency: "CHF",
          }),
        ).toBe(5);
      }
    },
  );

  it("shows cryptocurrency tickers and quantities for active and archived accounts", () => {
    for (const isActive of [true, false]) {
      const row = createAccountRow({
        unit: Unit.CRYPTOCURRENCY,
        currency: null,
        cryptocurrency: "BTC",
        balance: 2,
        isActive,
      });
      expect(
        getAccountListUnitIdentifierDisplayValue({
          data: row,
          referenceCurrency: "CHF",
        }),
      ).toBe("BTC");
      expect(
        getAccountListBalanceValue({
          data: row,
          referenceCurrency: "CHF",
        }),
      ).toBe(2);
    }
  });

  it("leaves groups, virtual Archived rows, totals, unitless accounts, and missing data blank in unit and native balance columns", () => {
    for (const data of [
      createGroupRow(),
      { ...createGroupRow(), isVirtualArchivedGroup: true },
      footerRow,
      createAccountRow({ unit: null, balance: null }),
      undefined,
    ]) {
      expect(
        getAccountListUnitIdentifierDisplayValue({
          data,
          referenceCurrency: "CHF",
        }),
      ).toBeUndefined();
      expect(
        getAccountListBalanceValue({
          data,
          referenceCurrency: "CHF",
        }),
      ).toBeNull();
    }
  });
});
