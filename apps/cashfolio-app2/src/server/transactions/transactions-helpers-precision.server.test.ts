import { describe, expect, test } from "vitest";
import { AccountType, Unit } from "../../.prisma-client/enums";
import {
  buildTransactionCreateData,
  validateCreateTransaction,
} from "./transactions-helpers.server.test-support";
describe("exact monetary transaction validation", () => {
  function transaction(values: number[]) {
    return {
      accountBookId: "book-1",
      description: "precision regression",
      bookings: values.map((value, index) => ({
        accountId: `asset-${index}`,
        description: "",
        date: "2026-01-01T00:00:00.000Z",
        unit: Unit.CURRENCY,
        currency: "CHF",
        value,
      })),
    };
  }

  test.each([
    [0.1, 0.2, -0.3],
    [1, -0.9999],
    [1, -0.999999999],
  ])("agrees with the UI balance rule for %j", async (...values) => {
    const { validateEditTransactionBookingsRoot } =
      await import("../../components/transaction-editor/edit-transaction-modal-validation");
    const input = transaction(values);
    const uiError = validateEditTransactionBookingsRoot({
      bookings: input.bookings.map((booking, index) => ({
        key: String(index),
        account: booking.accountId,
        unit: booking.unit,
        currency: booking.currency,
        debit: booking.value > 0 ? booking.value : undefined,
        credit: booking.value < 0 ? -booking.value : undefined,
      })),
      accounts: input.bookings.map((booking) => ({
        value: booking.accountId,
        label: booking.accountId,
        type: AccountType.BALANCE,
        unit: Unit.CURRENCY,
      })),
      thousandSeparator: "'",
      decimalSeparator: ".",
    });
    if (uiError === null) {
      expect(() => validateCreateTransaction(input)).not.toThrow();
    } else {
      expect(() => validateCreateTransaction(input)).toThrow(
        "sum of all bookings must be zero",
      );
    }
  });

  test.each([0, NaN, Infinity, -Infinity])(
    "rejects invalid input %s before persistence",
    (value) => {
      expect(() =>
        validateCreateTransaction(transaction([value, -1])),
      ).toThrow();
      if (!Number.isFinite(value)) {
        expect(() =>
          buildTransactionCreateData(transaction([value, -1])),
        ).toThrow();
      }
    },
  );
});
