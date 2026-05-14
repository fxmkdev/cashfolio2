import { describe, expect, test } from "vitest";
import { createTransactionFormInitialValues } from "./edit-transaction-modal-values";

describe("createTransactionFormInitialValues", () => {
  test("supports split editing without a current account", () => {
    const result = createTransactionFormInitialValues({});

    expect(result.bookings).toHaveLength(2);
    expect(result.bookings[0]?.account).toBeUndefined();
    expect(result.bookings[1]?.account).toBeUndefined();
  });

  test("does not inject a current account when editing existing bookings", () => {
    const result = createTransactionFormInitialValues({
      initialValues: {
        description: "Transfer",
        bookings: [
          { account: "cash", description: "Cash leg" },
          { account: "bank", description: "Bank leg" },
        ],
      },
    });

    expect(result.bookings.map((booking) => booking.account)).toEqual([
      "cash",
      "bank",
    ]);
  });
});
