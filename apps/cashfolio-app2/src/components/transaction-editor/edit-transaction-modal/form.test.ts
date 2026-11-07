import { describe, expect, it, vi } from "vitest";
import { Unit } from "@/.prisma-client/enums";
import type { TransactionForm } from "../edit-transaction-modal-types";
import { propagateTransactionDate, submitTransactionForm } from "./form";
import { createFormFixture } from "./test-support";

function fixture() {
  return createFormFixture({
    bookings: [
      {
        key: "a",
        date: new Date(2026, 2, 3),
        account: "cash",
        unit: Unit.CURRENCY,
        currency: "CHF",
        debit: 10,
      },
      {
        key: "b",
        date: new Date(2026, 2, 5),
        account: "expense",
        unit: Unit.CURRENCY,
        currency: "CHF",
        credit: 10,
      },
    ],
  });
}

describe("transaction form boundaries", () => {
  it("does not propagate cloned dates representing the same calendar day", () => {
    const { form, setFieldValue } = fixture();
    propagateTransactionDate({
      form,
      date: new Date(2026, 2, 3),
      previousDate: new Date(2026, 2, 3),
      locale: "en-US",
    });
    expect(setFieldValue).not.toHaveBeenCalled();
    expect(form.values.bookings[1].date).toEqual(new Date(2026, 2, 5));
  });
  it("propagates a changed day to every booking", () => {
    const { form, setFieldValue } = fixture();
    const date = new Date(2026, 2, 4);
    propagateTransactionDate({
      form,
      date,
      previousDate: new Date(2026, 2, 3),
      locale: "en-US",
    });
    expect(setFieldValue).toHaveBeenCalledTimes(2);
    expect(form.values.bookings.map((booking) => booking.date)).toEqual([
      date,
      date,
    ]);
  });
  it("clears booking dates when the transaction date is cleared", () => {
    const { form } = fixture();
    propagateTransactionDate({
      form,
      date: null,
      previousDate: new Date(2026, 2, 3),
      locale: "en-US",
    });
    expect(form.values.bookings.map((booking) => booking.date)).toEqual([
      undefined,
      undefined,
    ]);
  });
  it("does not overwrite booking dates with invalid provisional input", () => {
    const { form, setFieldValue } = fixture();
    propagateTransactionDate({
      form,
      date: "invalid",
      previousDate: new Date(2026, 2, 3),
      locale: "en-US",
    });
    expect(setFieldValue).not.toHaveBeenCalled();
  });
  it("commits the active grid editor before validation and payload serialization", async () => {
    const { form } = fixture();
    const order: string[] = [];
    const onSubmit = vi.fn(async () => {
      order.push("submit");
    });
    const runSubmit = vi.fn(async (submit: () => void | Promise<void>) => {
      order.push("guard");
      await submit();
      return true;
    });
    const validate: TransactionForm["onSubmit"] = (onValid) => () => {
      order.push("validate");
      void onValid(form.getValues(), undefined);
    };
    await submitTransactionForm({
      form: { onSubmit: validate },
      runSubmit,
      onSubmit,
      stopEditing: async () => {
        order.push("commit");
        await Promise.resolve();
        form.values.bookings[0].description = "uncommitted text";
      },
    });
    expect(order).toEqual(["commit", "validate", "guard", "submit"]);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "",
        bookings: expect.arrayContaining([
          expect.objectContaining({
            accountId: "cash",
            description: "uncommitted text",
            value: 10,
          }),
        ]),
      }),
    );
  });
});
