import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Unit } from "@/.prisma-client/enums";
import { useEditTransactionGrid } from "./grid";
import { createFormFixture } from "./test-support";

function model(args: Parameters<typeof useEditTransactionGrid>[0]) {
  let result: ReturnType<typeof useEditTransactionGrid> | undefined;
  function Probe() {
    result = useEditTransactionGrid(args);
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  if (!result) throw new Error("Grid model did not render");
  return result;
}

describe("booking grid ownership", () => {
  it("keeps mutable grid rows separate from form values and the initial snapshot", () => {
    const { form } = createFormFixture({
      bookings: [
        {
          key: "cash",
          account: "cash",
          debit: 10,
          unit: Unit.CURRENCY,
          currency: "CHF",
        },
        { key: "expense", credit: 10 },
      ],
    });
    const grid = model({
      form,
      accounts: [],
      currentAccountId: "cash",
      unitUsage: undefined,
      accountBookStartDay: new Date("2026-01-04T00:00:00.000Z"),
      isSubmitting: false,
    });
    expect(grid.bookingRows[0]).not.toBe(form.values.bookings[0]);
    grid.bookingRows[0].debit = 99;
    expect(form.values.bookings[0].debit).toBe(10);
    expect(form.getInitialValues().bookings[0].debit).toBe(10);
    expect(grid.context.lockedBookingKey).toBe("cash");
    expect(grid.context.deleteDisabled).toBe(true);
  });
  it("allows removal controls above the minimum and blocks mutations while pending", () => {
    const { form, removeListItem } = createFormFixture({
      bookings: [{ key: "a" }, { key: "b" }, { key: "c" }],
    });
    const grid = model({
      form,
      accounts: [],
      unitUsage: undefined,
      accountBookStartDay: new Date("2026-01-04T00:00:00.000Z"),
      isSubmitting: true,
    });
    expect(grid.context.deleteDisabled).toBe(false);
    expect(grid.context.isSubmitting).toBe(true);
    grid.context.onDelete("c");
    expect(removeListItem).not.toHaveBeenCalled();
  });
});
