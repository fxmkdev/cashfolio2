import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import { addUtcDays } from "../shared/date";
import {
  CHF,
  EUR,
  addAccount,
  addGroup,
  book,
  opening,
  post,
  type SeedBook,
  type SeedDataset,
} from "./dataset-model";
import { householdAccounts, householdTransactions } from "./dataset-household";

export { GAIN_LOSS_ACCOUNT_KEY } from "./dataset-model";
export type {
  SeedAccount,
  SeedBook,
  SeedBooking,
  SeedDataset,
  SeedGroup,
  SeedTransaction,
} from "./dataset-model";

/** Interpret the deployment clock in Switzerland; persisted dates use UTC days. */
export function getZurichToday(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CH", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)!.value);
  return new Date(Date.UTC(value("year"), value("month") - 1, value("day")));
}

function resolveToday(today: Date | undefined): Date {
  if (!today) return getZurichToday();
  if (
    !Number.isFinite(today.getTime()) ||
    today.toISOString().slice(11) !== "00:00:00.000Z"
  ) {
    throw new Error(
      "Seed today must be a valid calendar date at UTC midnight.",
    );
  }
  return new Date(today);
}

function threeYearsBefore(today: Date): Date {
  const year = today.getUTCFullYear() - 3;
  const month = today.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(today.getUTCDate(), lastDay)));
}

function edgeCases(startDate: Date, today: Date): SeedBook {
  const target = book("edge-cases", "Valuation Edge Cases", startDate);
  addGroup(target, "cash", "Cash", AccountType.ASSET, { isCashAccount: true });
  addAccount(target, "current", "Transfer account CHF", AccountType.ASSET, {
    ...CHF,
    groupKey: "cash",
    isCashAccount: true,
  });
  addAccount(target, "eur", "Transfer account EUR", AccountType.ASSET, {
    ...EUR,
    groupKey: "cash",
    isCashAccount: true,
  });
  addAccount(target, "opening", "Opening Balances", AccountType.EQUITY, {
    equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
  });
  addAccount(
    target,
    "unlisted",
    "Unlisted investment (valuation unavailable)",
    AccountType.ASSET,
    { unit: Unit.SECURITY, symbol: "CFDEMO_UNLISTED", tradeCurrency: "CHF" },
  );
  addAccount(
    target,
    "travel",
    "Travel in multiple currencies",
    AccountType.EQUITY,
    { equityAccountSubtype: EquityAccountSubtype.EXPENSE },
  );
  opening(target, "current", "1500");
  opening(target, "eur", "500");
  opening(target, "unlisted", "10");
  const monthStart = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
  );
  post(
    target,
    addUtcDays(monthStart, -1),
    "Month-end transfer with next-day settlement",
    [
      { accountKey: "current", value: "-190" },
      { accountKey: "eur", value: "200", date: monthStart },
    ],
  );
  post(target, today, "Cross-currency restaurant bill", [
    { accountKey: "eur", value: "-45" },
    { accountKey: "travel", value: "45", metadata: EUR },
  ]);
  return target;
}

export function generateStagingDataset(today?: Date): SeedDataset {
  const resolvedToday = resolveToday(today);
  const startDate = threeYearsBefore(resolvedToday);
  const household = book("household", "Swiss Household Demo", startDate);
  householdAccounts(household);
  householdTransactions(household, resolvedToday);
  return {
    today: resolvedToday,
    books: [
      household,
      edgeCases(startDate, resolvedToday),
      book("empty", "Empty Demo", startDate),
    ],
  };
}

/** Upload this sample to Everyday account CHF to exercise statement import. */
export function generateStatementImportSample(today?: Date): string {
  const day = resolveToday(today).toISOString().slice(0, 10);
  return [
    "date,amount,original amount,original currency,exchange rate,description",
    `${day},-54.60,,,,Demo statement groceries`,
    `${day},-42.75,-45.00,EUR,0.95,Demo statement restaurant abroad`,
    `${day},125.00,,,,Demo statement refund`,
    "",
  ].join("\n");
}
