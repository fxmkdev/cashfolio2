import Decimal from "decimal.js";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import { getOpeningBalancesBookingDate } from "../shared/date";
import type { StatementImportCsvFormat } from "../shared/statement-import-csv-format";

export const GAIN_LOSS_ACCOUNT_KEY = "gain-loss";

type UnitMetadata = {
  unit?: Unit;
  currency?: string;
  cryptocurrency?: string;
  symbol?: string;
  tradeCurrency?: string;
};

export type SeedGroup = {
  key: string;
  name: string;
  type: AccountType;
  equityAccountSubtype?: EquityAccountSubtype;
  parentKey?: string;
  isActive: boolean;
  isCashAccount: boolean;
  sortOrder: number;
};

export type SeedAccount = UnitMetadata & {
  key: string;
  name: string;
  type: AccountType;
  equityAccountSubtype?: EquityAccountSubtype;
  groupKey?: string;
  isActive: boolean;
  isCashAccount: boolean;
  sortOrder: number;
  statementImportCsvFormat?: StatementImportCsvFormat;
};

export type SeedBooking = Omit<UnitMetadata, "unit"> & {
  accountKey: string;
  date: Date;
  description: string;
  unit: Unit;
  value: string;
  sortOrder: number;
};

export type SeedTransaction = {
  description: string;
  bookings: SeedBooking[];
};

export type SeedBook = {
  key: string;
  name: string;
  referenceCurrency: string;
  startDate: Date;
  groups: SeedGroup[];
  accounts: SeedAccount[];
  transactions: SeedTransaction[];
};

export type SeedDataset = { today: Date; books: SeedBook[] };

export const CHF = { unit: Unit.CURRENCY, currency: "CHF" };
export const EUR = { unit: Unit.CURRENCY, currency: "EUR" };
export const USD = { unit: Unit.CURRENCY, currency: "USD" };
export const BTC = { unit: Unit.CRYPTOCURRENCY, cryptocurrency: "BTC" };
export const ETH = { unit: Unit.CRYPTOCURRENCY, cryptocurrency: "ETH" };
export const AAPL = {
  unit: Unit.SECURITY,
  symbol: "AAPL",
  tradeCurrency: "USD",
};
export const MSFT = {
  unit: Unit.SECURITY,
  symbol: "MSFT",
  tradeCurrency: "USD",
};

export const statementImportCsvFormat: StatementImportCsvFormat = {
  hasHeader: true,
  delimitersToGuess: [",", ";"],
  columns: [
    "date",
    "amount",
    "original amount",
    "original currency",
    "exchange rate",
    "description",
  ],
  dateFormat: "yyyy-MM-dd",
  numberFormat: { decimalSeparator: "." },
};

export function book(key: string, name: string, startDate: Date): SeedBook {
  return {
    key,
    name,
    referenceCurrency: "CHF",
    startDate,
    groups: [],
    accounts: [],
    transactions: [],
  };
}

export function addGroup(
  target: SeedBook,
  key: string,
  name: string,
  type: AccountType,
  options: Partial<SeedGroup> = {},
) {
  target.groups.push({
    key,
    name,
    type,
    isActive: true,
    isCashAccount: false,
    sortOrder: target.groups.length,
    ...options,
  });
}

export function addAccount(
  target: SeedBook,
  key: string,
  name: string,
  type: AccountType,
  options: Partial<SeedAccount> = {},
) {
  target.accounts.push({
    key,
    name,
    type,
    isActive: true,
    isCashAccount: false,
    sortOrder: target.accounts.length,
    ...options,
  });
}

export function metadata(account: UnitMetadata): UnitMetadata & { unit: Unit } {
  return {
    unit: account.unit ?? Unit.CURRENCY,
    ...(account.currency ? { currency: account.currency } : undefined),
    ...(account.cryptocurrency
      ? { cryptocurrency: account.cryptocurrency }
      : undefined),
    ...(account.symbol ? { symbol: account.symbol } : undefined),
    ...(account.tradeCurrency
      ? { tradeCurrency: account.tradeCurrency }
      : undefined),
    ...(!account.unit ? CHF : undefined),
  };
}

type Posting = {
  accountKey: string;
  value: Decimal.Value;
  date?: Date;
  description?: string;
  metadata?: UnitMetadata & { unit: Unit };
};

export function post(
  target: SeedBook,
  date: Date,
  description: string,
  postings: Posting[],
) {
  target.transactions.push({
    description,
    bookings: postings.map((posting, sortOrder) => {
      const account = target.accounts.find(
        (candidate) => candidate.key === posting.accountKey,
      );
      if (!account && posting.accountKey !== GAIN_LOSS_ACCOUNT_KEY) {
        throw new Error(`Unknown seed account: ${posting.accountKey}`);
      }
      return {
        accountKey: posting.accountKey,
        date: new Date(posting.date ?? date),
        description: posting.description ?? description,
        ...metadata(posting.metadata ?? account ?? CHF),
        value: new Decimal(posting.value).toString(),
        sortOrder,
      };
    }),
  });
}

export function transfer(
  target: SeedBook,
  date: Date,
  description: string,
  from: string,
  to: string,
  value: Decimal.Value,
) {
  post(target, date, description, [
    { accountKey: from, value: new Decimal(value).negated() },
    { accountKey: to, value },
  ]);
}

export function opening(
  target: SeedBook,
  accountKey: string,
  value: Decimal.Value,
) {
  const account = target.accounts.find((item) => item.key === accountKey)!;
  post(
    target,
    getOpeningBalancesBookingDate(target.startDate),
    `Opening balance: ${account.name}`,
    [
      { accountKey, value },
      {
        accountKey: "opening",
        value: new Decimal(value).negated(),
        metadata: metadata(account),
      },
    ],
  );
}
