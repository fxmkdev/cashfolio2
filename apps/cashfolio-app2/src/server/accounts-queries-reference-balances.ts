import type {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import {
  getCryptocurrencyToCurrencyExchangeRate,
  getCurrencyExchangeRate,
  getSecurityToCurrencyExchangeRate,
} from "./valuation.server";
import { computeRawBalanceInReferenceCurrency } from "./accounts-reference-balance";

export type AccountState = "active" | "inactive";

export type AccountReferenceBalanceSource = {
  id: string;
  type: AccountType;
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
};

export function getAccountsWhereClause(args: {
  accountBookId: string;
  accountState: AccountState;
  type?: AccountType;
  equityAccountSubtype?: EquityAccountSubtype;
}) {
  return {
    accountBookId: args.accountBookId,
    isActive: args.accountState === "active",
    type: args.type,
    ...(args.equityAccountSubtype
      ? { equityAccountSubtype: args.equityAccountSubtype }
      : undefined),
  };
}

export async function getDisplayBalanceInReferenceCurrencyByAccountId(args: {
  accounts: AccountReferenceBalanceSource[];
  rawBalanceByAccountId: Map<string, number>;
  referenceCurrency: string;
  includeReferenceBalances: boolean;
}): Promise<Map<string, number | null>> {
  const {
    accounts,
    rawBalanceByAccountId,
    referenceCurrency,
    includeReferenceBalances,
  } = args;

  if (!includeReferenceBalances) {
    return new Map(accounts.map((account) => [account.id, null] as const));
  }

  const today = new Date();
  let usdToReferenceRatePromise: Promise<number | null> | null = null;
  const getUsdToReferenceRate = () => {
    if (referenceCurrency === "USD") {
      return Promise.resolve(1);
    }

    if (!usdToReferenceRatePromise) {
      usdToReferenceRatePromise = getCurrencyExchangeRate({
        sourceCurrency: "USD",
        targetCurrency: referenceCurrency,
        date: today,
      });
    }

    return usdToReferenceRatePromise;
  };
  const exchangeRateBySourceCurrency = new Map<
    string,
    Promise<number | null>
  >();
  const exchangeRateByCryptocurrency = new Map<
    string,
    Promise<number | null>
  >();
  const exchangeRateBySecurity = new Map<string, Promise<number | null>>();
  const getCurrencyToReferenceRate = (sourceCurrency: string) => {
    const normalizedSourceCurrency = sourceCurrency.toUpperCase();
    const existingPromise = exchangeRateBySourceCurrency.get(
      normalizedSourceCurrency,
    );
    if (existingPromise) {
      return existingPromise;
    }

    const exchangeRatePromise = (async () => {
      if (normalizedSourceCurrency === "USD") {
        return getUsdToReferenceRate();
      }

      const [usdToReferenceRate, sourceToUsdRate] = await Promise.all([
        getUsdToReferenceRate(),
        getCurrencyExchangeRate({
          sourceCurrency: normalizedSourceCurrency,
          targetCurrency: "USD",
          date: today,
        }),
      ]);
      if (usdToReferenceRate == null || sourceToUsdRate == null) {
        return null;
      }
      return sourceToUsdRate * usdToReferenceRate;
    })();
    exchangeRateBySourceCurrency.set(
      normalizedSourceCurrency,
      exchangeRatePromise,
    );
    return exchangeRatePromise;
  };
  const getCryptocurrencyToReferenceRate = (cryptocurrency: string) => {
    const normalizedCryptocurrency = cryptocurrency.toUpperCase();
    const existingPromise = exchangeRateByCryptocurrency.get(
      normalizedCryptocurrency,
    );
    if (existingPromise) {
      return existingPromise;
    }

    const exchangeRatePromise = getCryptocurrencyToCurrencyExchangeRate({
      cryptocurrency: normalizedCryptocurrency,
      targetCurrency: referenceCurrency,
      date: today,
    });
    exchangeRateByCryptocurrency.set(
      normalizedCryptocurrency,
      exchangeRatePromise,
    );
    return exchangeRatePromise;
  };
  const getSecurityToReferenceRate = (
    symbol: string,
    tradeCurrency: string,
  ) => {
    const normalizedSymbol = symbol.toUpperCase();
    const normalizedTradeCurrency = tradeCurrency.toUpperCase();
    const securityKey = `${normalizedSymbol}:${normalizedTradeCurrency}:${referenceCurrency}`;
    const existingPromise = exchangeRateBySecurity.get(securityKey);
    if (existingPromise) {
      return existingPromise;
    }

    const exchangeRatePromise = getSecurityToCurrencyExchangeRate({
      symbol: normalizedSymbol,
      tradeCurrency: normalizedTradeCurrency,
      targetCurrency: referenceCurrency,
      date: today,
    });
    exchangeRateBySecurity.set(securityKey, exchangeRatePromise);
    return exchangeRatePromise;
  };

  return new Map(
    await Promise.all(
      accounts.map(async (account) => {
        const rawBalance = rawBalanceByAccountId.get(account.id) ?? 0;
        const rawBalanceInReferenceCurrency =
          await computeRawBalanceInReferenceCurrency({
            type: account.type,
            unit: account.unit,
            currency: account.currency,
            cryptocurrency: account.cryptocurrency,
            symbol: account.symbol,
            tradeCurrency: account.tradeCurrency,
            rawBalance,
            referenceCurrency,
            getCurrencyToReferenceRate,
            getCryptocurrencyToReferenceRate,
            getSecurityToReferenceRate,
          });

        const displayBalanceInReferenceCurrency =
          rawBalanceInReferenceCurrency == null
            ? null
            : account.type === "ASSET"
              ? rawBalanceInReferenceCurrency
              : account.type === "LIABILITY"
                ? -rawBalanceInReferenceCurrency
                : null;

        return [account.id, displayBalanceInReferenceCurrency] as const;
      }),
    ),
  );
}
