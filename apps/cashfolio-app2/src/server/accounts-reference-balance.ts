import type { AccountType, Unit } from "../.prisma-client/enums";

export async function computeRawBalanceInReferenceCurrency(args: {
  type: AccountType;
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  rawBalance: number;
  referenceCurrency: string;
  getCurrencyToReferenceRate: (
    sourceCurrency: string,
  ) => Promise<number | null>;
  getCryptocurrencyToReferenceRate: (
    cryptocurrency: string,
  ) => Promise<number | null>;
  getSecurityToReferenceRate: (
    symbol: string,
    tradeCurrency: string,
  ) => Promise<number | null>;
}): Promise<number | null> {
  const isAssetOrLiability = args.type === "ASSET" || args.type === "LIABILITY";
  if (!isAssetOrLiability) return null;

  if (args.unit === "CURRENCY") {
    if (!args.currency) return null;
    if (args.rawBalance === 0) return 0;

    const sourceCurrency = args.currency.toUpperCase();
    if (sourceCurrency === args.referenceCurrency) {
      return args.rawBalance;
    }

    const exchangeRate = await args.getCurrencyToReferenceRate(sourceCurrency);
    return exchangeRate == null ? null : args.rawBalance * exchangeRate;
  }

  if (args.unit === "CRYPTOCURRENCY") {
    if (!args.cryptocurrency) return null;
    if (args.rawBalance === 0) return 0;

    const exchangeRate = await args.getCryptocurrencyToReferenceRate(
      args.cryptocurrency.toUpperCase(),
    );
    return exchangeRate == null ? null : args.rawBalance * exchangeRate;
  }

  if (args.unit === "SECURITY") {
    if (!args.symbol || !args.tradeCurrency) return null;
    if (args.rawBalance === 0) return 0;

    const exchangeRate = await args.getSecurityToReferenceRate(
      args.symbol.toUpperCase(),
      args.tradeCurrency.toUpperCase(),
    );
    return exchangeRate == null ? null : args.rawBalance * exchangeRate;
  }

  return null;
}
