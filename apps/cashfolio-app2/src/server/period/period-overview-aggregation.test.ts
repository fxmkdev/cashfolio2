import { toMoney } from "../../shared/money";
import { toNumericMoney } from "../money-boundary";
import { describe, expect, it } from "vitest";
import { EquityAccountSubtype } from "../../.prisma-client/enums";
import {
  accumulateConvertedEquityBooking,
  createPeriodOverviewEquityAggregation,
} from "./period-overview-aggregation";

describe("period overview aggregation", () => {
  it("aggregates converted equity bookings by subtype and account", () => {
    const aggregation = createPeriodOverviewEquityAggregation();

    accumulateConvertedEquityBooking({
      booking: {
        account: {
          id: "income-1",
          name: "Salary",
          groupId: null,
          equityAccountSubtype: EquityAccountSubtype.INCOME,
        },
      },
      convertedValue: toMoney(-100),
      aggregation,
    });
    accumulateConvertedEquityBooking({
      booking: {
        account: {
          id: "income-1",
          name: "Salary",
          groupId: null,
          equityAccountSubtype: EquityAccountSubtype.INCOME,
        },
      },
      convertedValue: toMoney(-25),
      aggregation,
    });
    accumulateConvertedEquityBooking({
      booking: {
        account: {
          id: "expense-1",
          name: "Rent",
          groupId: "group-expense",
          equityAccountSubtype: EquityAccountSubtype.EXPENSE,
        },
      },
      convertedValue: toMoney(40),
      aggregation,
    });
    accumulateConvertedEquityBooking({
      booking: {
        account: {
          id: "gainloss-1",
          name: "FX",
          groupId: null,
          equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
        },
      },
      convertedValue: toMoney(-20),
      aggregation,
    });

    expect(toNumericMoney(aggregation.income)).toBe(125);
    expect(toNumericMoney(aggregation.expenses)).toBe(40);
    expect(toNumericMoney(aggregation.explicitGainLoss)).toBe(20);
    expect(
      toNumericMoney(aggregation.incomeAmountByAccountId.get("income-1")),
    ).toMatchObject({
      accountName: "Salary",
      amount: 125,
    });
    expect(
      toNumericMoney(aggregation.expenseAmountByAccountId.get("expense-1")),
    ).toMatchObject({
      accountName: "Rent",
      groupId: "group-expense",
      amount: 40,
    });
  });
});
