import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountType, Unit } from "../.prisma-client/enums";

const ensureAuthorizedForAccountBookId = vi.hoisted(() => vi.fn());
const getCurrencyExchangeRate = vi.hoisted(() => vi.fn());
const getCryptocurrencyToCurrencyExchangeRate = vi.hoisted(() => vi.fn());
const getSecurityToCurrencyExchangeRate = vi.hoisted(() => vi.fn());

const prisma = vi.hoisted(() => ({
  account: {
    findMany: vi.fn(),
  },
  booking: {
    groupBy: vi.fn(),
  },
  accountBook: {
    findUniqueOrThrow: vi.fn(),
  },
}));

vi.mock("../prisma.server", () => ({
  prisma,
}));

vi.mock("../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId,
}));

vi.mock("./fx.server", () => ({
  getCurrencyExchangeRate,
  getCryptocurrencyToCurrencyExchangeRate,
  getSecurityToCurrencyExchangeRate,
}));

import { getAccountReferenceBalancesInternal } from "./accounts-queries";

describe("getAccountReferenceBalancesInternal", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.account.findMany.mockResolvedValue([]);
    prisma.booking.groupBy.mockResolvedValue([]);
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      referenceCurrency: "CHF",
    });

    getCurrencyExchangeRate.mockResolvedValue(1);
    getCryptocurrencyToCurrencyExchangeRate.mockResolvedValue(null);
    getSecurityToCurrencyExchangeRate.mockResolvedValue(null);
  });

  it("filters accounts by selected tab and mode", async () => {
    await getAccountReferenceBalancesInternal({
      data: {
        accountBookId: "book-1",
        accountState: "inactive",
        type: AccountType.ASSET,
      },
    });

    expect(ensureAuthorizedForAccountBookId).toHaveBeenCalledWith("book-1");
    expect(prisma.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          accountBookId: "book-1",
          isActive: false,
          type: AccountType.ASSET,
        },
      }),
    );
  });

  it("returns signed reference balances and preserves null when conversion is unavailable", async () => {
    prisma.account.findMany.mockResolvedValue([
      {
        id: "asset-chf",
        type: AccountType.ASSET,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
      },
      {
        id: "liability-usd",
        type: AccountType.LIABILITY,
        unit: Unit.CURRENCY,
        currency: "USD",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
      },
      {
        id: "asset-security",
        type: AccountType.ASSET,
        unit: Unit.SECURITY,
        currency: null,
        cryptocurrency: null,
        symbol: "AAPL",
        tradeCurrency: "USD",
      },
    ]);
    prisma.booking.groupBy.mockResolvedValue([
      { accountId: "asset-chf", _sum: { value: 10 } },
      { accountId: "liability-usd", _sum: { value: 5 } },
      { accountId: "asset-security", _sum: { value: 3 } },
    ]);
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      referenceCurrency: "CHF",
    });

    getCurrencyExchangeRate.mockImplementation(
      async ({ sourceCurrency, targetCurrency }) => {
        if (sourceCurrency === "USD" && targetCurrency === "CHF") return 0.9;
        if (sourceCurrency === "USD" && targetCurrency === "USD") return 1;
        return null;
      },
    );
    getSecurityToCurrencyExchangeRate.mockResolvedValue(null);

    const result = await getAccountReferenceBalancesInternal({
      data: {
        accountBookId: "book-2",
        accountState: "active",
      },
    });

    expect(result.referenceCurrency).toBe("CHF");
    expect(result.rows).toEqual([
      { id: "asset-chf", balanceInReferenceCurrency: 10 },
      { id: "liability-usd", balanceInReferenceCurrency: -4.5 },
      { id: "asset-security", balanceInReferenceCurrency: null },
    ]);
  });
});
