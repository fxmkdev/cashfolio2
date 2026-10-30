import Decimal from "decimal.js";
import { expect, it } from "vitest";
import { generateStagingDataset } from "../staging-seed/dataset";
import { getE2ESecurityPrice } from "./security-prices";

it("matches each closed investment's recorded execution price in the fixed staging fixture", () => {
  const household = generateStagingDataset(new Date("2026-10-10T00:00:00Z"))
    .books[0];
  const trades = household.transactions.filter((transaction) =>
    transaction.description.startsWith("Archived investment:"),
  );
  expect(trades).toHaveLength(6);
  for (const transaction of trades) {
    const holding = transaction.bookings.find(
      (booking) => booking.unit === "SECURITY",
    )!;
    const cash = transaction.bookings.find(
      (booking) => booking.currency === "USD",
    )!;
    const executionPrice = new Decimal(cash.value).div(holding.value).abs();
    expect(
      getE2ESecurityPrice(
        holding.symbol!,
        holding.date.toISOString().slice(0, 10),
      ),
    ).toBe(executionPrice.toNumber());
  }
});

it("retains ordinary quotes on other dates and missing-price behavior", () => {
  expect(getE2ESecurityPrice("AAPL", "2026-01-10")).toBe(10);
  expect(getE2ESecurityPrice("MSFT", "2023-12-10")).toBe(12);
  expect(getE2ESecurityPrice("CFDEMO_UNLISTED", "2023-12-09")).toBeUndefined();
});
