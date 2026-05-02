import { AccountType, type Unit } from "../.prisma-client/enums";
import {
  moneyAdd,
  moneyIsZero,
  moneySubtract,
  toMoneyNumber,
} from "../shared/money";

export type EndOfPeriodBalanceAccount = {
  id: string;
  type: AccountType;
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
};

export type EndOfPeriodBalanceStats = {
  assets: number;
  liabilities: number;
  netWorth: number;
  skippedCount: number;
};

type EndOfPeriodBalanceComputationResult = EndOfPeriodBalanceStats & {
  convertedBalanceByAccountId: Map<string, number | null>;
};

type ConvertBalanceToReference = (input: {
  value: number;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  date: Date;
  referenceCurrency: string;
}) => Promise<number | null>;

export async function computeEndOfPeriodBalanceStatsWithConvertedBalances(args: {
  accounts: EndOfPeriodBalanceAccount[];
  rawBalanceByAccountId: Map<string, number>;
  periodEnd: Date;
  referenceCurrency: string;
  convertBalanceToReference: ConvertBalanceToReference;
}): Promise<EndOfPeriodBalanceComputationResult> {
  let assets = 0;
  let liabilities = 0;
  let skippedCount = 0;
  const convertedBalanceByAccountId = new Map<string, number | null>();

  const conversionResults = await Promise.all(
    args.accounts.map(async (account) => {
      const rawBalance = args.rawBalanceByAccountId.get(account.id) ?? 0;

      if (account.unit == null) {
        const normalizedConvertedBalance = moneyIsZero(rawBalance) ? 0 : null;

        return {
          accountId: account.id,
          accountType: account.type,
          convertedBalance: normalizedConvertedBalance,
          skipped: normalizedConvertedBalance == null,
        };
      }

      const convertedBalance = await args.convertBalanceToReference({
        value: rawBalance,
        unit: account.unit,
        currency: account.currency,
        cryptocurrency: account.cryptocurrency,
        symbol: account.symbol,
        tradeCurrency: account.tradeCurrency,
        date: args.periodEnd,
        referenceCurrency: args.referenceCurrency,
      });

      const normalizedConvertedBalance =
        convertedBalance ?? (moneyIsZero(rawBalance) ? 0 : null);

      return {
        accountId: account.id,
        accountType: account.type,
        convertedBalance: normalizedConvertedBalance,
        skipped: normalizedConvertedBalance == null && !moneyIsZero(rawBalance),
      };
    }),
  );

  for (const conversionResult of conversionResults) {
    convertedBalanceByAccountId.set(
      conversionResult.accountId,
      conversionResult.convertedBalance,
    );

    if (conversionResult.skipped || conversionResult.convertedBalance == null) {
      if (conversionResult.skipped) {
        skippedCount += 1;
      }
      continue;
    }

    if (conversionResult.accountType === AccountType.ASSET) {
      assets = toMoneyNumber(
        moneyAdd(assets, conversionResult.convertedBalance),
      );
    } else if (conversionResult.accountType === AccountType.LIABILITY) {
      liabilities = toMoneyNumber(
        moneySubtract(liabilities, conversionResult.convertedBalance),
      );
    }
  }

  return {
    assets,
    liabilities,
    netWorth: toMoneyNumber(moneySubtract(assets, liabilities)),
    skippedCount,
    convertedBalanceByAccountId,
  };
}

export async function computeEndOfPeriodBalanceStats(args: {
  accounts: EndOfPeriodBalanceAccount[];
  rawBalanceByAccountId: Map<string, number>;
  periodEnd: Date;
  referenceCurrency: string;
  convertBalanceToReference: ConvertBalanceToReference;
}): Promise<EndOfPeriodBalanceStats> {
  const result =
    await computeEndOfPeriodBalanceStatsWithConvertedBalances(args);

  return {
    assets: result.assets,
    liabilities: result.liabilities,
    netWorth: result.netWorth,
    skippedCount: result.skippedCount,
  };
}
