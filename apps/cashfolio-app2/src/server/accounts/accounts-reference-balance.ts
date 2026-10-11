import {
  toMoney,
  type Money,
  moneyMultiply,
  moneyIsZero,
} from "../../shared/money";
import type { AccountType, Unit } from "../../.prisma-client/enums";

export async function computeRawBalanceInReferenceCurrency(args: {
  type: AccountType;
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  rawBalance: Money;
  referenceCurrency: string;
  getCurrencyToReferenceRate: (sourceCurrency: string) => Promise<Money | null>;
  getCryptocurrencyToReferenceRate: (
    cryptocurrency: string,
  ) => Promise<Money | null>;
  getSecurityToReferenceRate: (
    symbol: string,
    tradeCurrency: string,
  ) => Promise<Money | null>;
}): Promise<Money | null> {
  const isAssetOrLiability = args.type === "ASSET" || args.type === "LIABILITY";
  if (!isAssetOrLiability) return null;

  if (args.unit === "CURRENCY") {
    if (!args.currency) return null;
    if (moneyIsZero(args.rawBalance)) return toMoney(0);

    const sourceCurrency = args.currency.toUpperCase();
    if (sourceCurrency === args.referenceCurrency) {
      return args.rawBalance;
    }

    const exchangeRate = await args.getCurrencyToReferenceRate(sourceCurrency);
    return exchangeRate == null
      ? null
      : moneyMultiply(args.rawBalance, exchangeRate);
  }

  if (args.unit === "CRYPTOCURRENCY") {
    if (!args.cryptocurrency) return null;
    if (moneyIsZero(args.rawBalance)) return toMoney(0);

    const exchangeRate = await args.getCryptocurrencyToReferenceRate(
      args.cryptocurrency.toUpperCase(),
    );
    return exchangeRate == null
      ? null
      : moneyMultiply(args.rawBalance, exchangeRate);
  }

  if (args.unit === "SECURITY") {
    if (!args.symbol || !args.tradeCurrency) return null;
    if (moneyIsZero(args.rawBalance)) return toMoney(0);

    const exchangeRate = await args.getSecurityToReferenceRate(
      args.symbol.toUpperCase(),
      args.tradeCurrency.toUpperCase(),
    );
    return exchangeRate == null
      ? null
      : moneyMultiply(args.rawBalance, exchangeRate);
  }

  return null;
}
