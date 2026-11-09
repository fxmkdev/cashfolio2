import { describe, expect, test } from "vitest";
import { toMoney } from "../shared/money";
import { toNumericMoney } from "./money-boundary";
import {
  buildBreakdownItems,
  createBreakdownBucket,
} from "./period.test-support";

describe("expense breakdown grouping", () => {
  const groupById = new Map([
    [
      "expenses",
      {
        id: "expenses",
        name: "Expenses",
        parentGroupId: null,
      },
    ],
    [
      "housing",
      {
        id: "housing",
        name: "Housing",
        parentGroupId: "expenses",
      },
    ],
    [
      "rent",
      {
        id: "rent",
        name: "Rent",
        parentGroupId: "housing",
      },
    ],
  ]);

  test("buckets by top-level root group", () => {
    expect(
      toNumericMoney(
        createBreakdownBucket({
          accountId: "account-rent",
          accountName: "Rent Account",
          groupId: "rent",
          groupById,
        }),
      ),
    ).toEqual({
      id: "group:expenses",
      label: "Expenses",
      kind: "group",
    });
  });

  test("falls back to account bucket when group cannot be resolved", () => {
    expect(
      toNumericMoney(
        createBreakdownBucket({
          accountId: "account-misc",
          accountName: "Misc",
          groupId: "missing-group",
          groupById,
        }),
      ),
    ).toEqual({
      id: "account:account-misc",
      label: "Misc",
      kind: "account",
    });
  });

  test("keeps only positive-net buckets and computes percentages", () => {
    const breakdown = buildBreakdownItems([
      {
        id: "group:housing",
        label: "Housing",
        kind: "group",
        amount: toMoney(1900),
      },
      {
        id: "group:food",
        label: "Food",
        kind: "group",
        amount: toMoney(1100),
      },
      {
        id: "account:refunds",
        label: "Refunds",
        kind: "account",
        amount: toMoney(-200),
      },
    ]);

    expect(toNumericMoney(breakdown.totalAmount)).toBe(3000);
    expect(breakdown.items).toHaveLength(2);
    expect(toNumericMoney(breakdown.items[0])).toMatchObject({
      id: "group:housing",
      percentage: 63.33,
    });
    expect(toNumericMoney(breakdown.items[1])).toMatchObject({
      id: "group:food",
      percentage: 36.67,
    });
  });
});
