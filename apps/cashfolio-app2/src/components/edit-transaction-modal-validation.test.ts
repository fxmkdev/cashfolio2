import { describe, expect, test } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import { GAIN_LOSS_SIMPLE_TRANSACTION_INVARIANT_MESSAGE } from "../shared/gain-loss-transaction-invariant";
import { validateEditTransactionBookingsRoot } from "./edit-transaction-modal-validation";
import type {
  AccountOption,
  BookingValues,
} from "./edit-transaction-modal-types";

function account(
  value: string,
  type: AccountType,
  equityAccountSubtype: EquityAccountSubtype | null,
): AccountOption {
  return {
    value,
    label: value,
    unit: Unit.CURRENCY,
    currency: "CHF",
    type,
    equityAccountSubtype,
  };
}

function rootValidation(bookings: BookingValues[], accounts: AccountOption[]) {
  return validateEditTransactionBookingsRoot({
    bookings,
    accounts,
    thousandSeparator: "'",
    decimalSeparator: ".",
  });
}

describe("validateEditTransactionBookingsRoot", () => {
  test("allows valid gain/loss two-booking transaction", () => {
    const result = rootValidation(
      [
        {
          key: "1",
          account: "gain-loss",
          unit: Unit.CURRENCY,
          currency: "CHF",
          credit: 100,
        },
        {
          key: "2",
          account: "asset",
          unit: Unit.CURRENCY,
          currency: "CHF",
          debit: 100,
        },
      ],
      [
        account(
          "gain-loss",
          AccountType.EQUITY,
          EquityAccountSubtype.GAIN_LOSS,
        ),
        account("asset", AccountType.ASSET, null),
      ],
    );

    expect(result).toBeNull();
  });

  test("rejects invalid gain/loss composition", () => {
    const result = rootValidation(
      [
        {
          key: "1",
          account: "gain-loss",
          unit: Unit.CURRENCY,
          currency: "CHF",
          credit: 100,
        },
        {
          key: "2",
          account: "equity-other",
          unit: Unit.CURRENCY,
          currency: "CHF",
          debit: 100,
        },
      ],
      [
        account(
          "gain-loss",
          AccountType.EQUITY,
          EquityAccountSubtype.GAIN_LOSS,
        ),
        account("equity-other", AccountType.EQUITY, null),
      ],
    );

    expect(result).toBe(GAIN_LOSS_SIMPLE_TRANSACTION_INVARIANT_MESSAGE);
  });

  test("keeps existing income sign validation behavior", () => {
    const result = rootValidation(
      [
        {
          key: "1",
          account: "income",
          unit: Unit.CURRENCY,
          currency: "CHF",
          debit: 50,
        },
      ],
      [account("income", AccountType.EQUITY, EquityAccountSubtype.INCOME)],
    );

    expect(result).toBe("Income accounts cannot have debit entries.");
  });

  test("returns balance error when single-unit split is unbalanced", () => {
    const result = rootValidation(
      [
        {
          key: "1",
          account: "asset-1",
          unit: Unit.CURRENCY,
          currency: "CHF",
          debit: 100,
        },
        {
          key: "2",
          account: "asset-2",
          unit: Unit.CURRENCY,
          currency: "CHF",
          credit: 90,
        },
      ],
      [
        account("asset-1", AccountType.ASSET, null),
        account("asset-2", AccountType.ASSET, null),
      ],
    );

    expect(result).toContain("Transaction is not balanced");
  });

  test("formats balance difference without floating-point artifacts", () => {
    const result = rootValidation(
      [
        {
          key: "1",
          account: "asset-1",
          unit: Unit.CURRENCY,
          currency: "CHF",
          debit: 0.3,
        },
        {
          key: "2",
          account: "asset-2",
          unit: Unit.CURRENCY,
          currency: "CHF",
          credit: 0,
        },
      ],
      [
        account("asset-1", AccountType.ASSET, null),
        account("asset-2", AccountType.ASSET, null),
      ],
    );

    expect(result).toContain("0.3");
    expect(result).not.toContain("0.300000000000");
  });

  test("treats 0.1 + 0.2 and 0.3 as balanced with strict decimal equality", () => {
    const result = rootValidation(
      [
        {
          key: "1",
          account: "asset-1",
          unit: Unit.CURRENCY,
          currency: "CHF",
          debit: 0.1,
        },
        {
          key: "2",
          account: "asset-2",
          unit: Unit.CURRENCY,
          currency: "CHF",
          debit: 0.2,
        },
        {
          key: "3",
          account: "asset-3",
          unit: Unit.CURRENCY,
          currency: "CHF",
          credit: 0.3,
        },
      ],
      [
        account("asset-1", AccountType.ASSET, null),
        account("asset-2", AccountType.ASSET, null),
        account("asset-3", AccountType.ASSET, null),
      ],
    );

    expect(result).toBeNull();
  });
});
