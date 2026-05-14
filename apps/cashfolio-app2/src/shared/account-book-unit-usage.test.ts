import { describe, expect, test } from "vitest";
import { createAccountBookUnitUsage } from "./account-book-unit-usage";

describe("createAccountBookUnitUsage", () => {
  test("uses reference currency first and active account unit metadata only", () => {
    const usage = createAccountBookUnitUsage({
      referenceCurrency: "chf",
      accounts: [
        {
          isActive: true,
          currency: "usd",
          cryptocurrency: null,
          tradeCurrency: null,
        },
        {
          isActive: true,
          currency: null,
          cryptocurrency: null,
          tradeCurrency: "eur",
        },
        {
          isActive: true,
          currency: null,
          cryptocurrency: "btc",
          tradeCurrency: null,
        },
        {
          isActive: false,
          currency: "jpy",
          cryptocurrency: "eth",
          tradeCurrency: "gbp",
        },
      ],
    });

    expect(usage).toEqual({
      currencies: ["CHF", "EUR", "USD"],
      cryptocurrencies: ["BTC"],
    });
  });
});
