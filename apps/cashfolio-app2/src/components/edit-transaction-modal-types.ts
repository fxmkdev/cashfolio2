import type {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";

export type AccountOption = {
  label: string;
  value: string;
  unit: Unit;
  currency?: string | null;
  cryptocurrency?: string | null;
  symbol?: string | null;
  tradeCurrency?: string | null;
  type: AccountType;
  equityAccountSubtype?: EquityAccountSubtype | null;
};

export type BookingValues = {
  key: string;
  date?: string | Date;
  account?: string;
  description?: string;
  unit?: Unit;
  currency?: string;
  cryptocurrency?: string;
  symbol?: string;
  tradeCurrency?: string;
  debit?: number;
  credit?: number;
};

export type TransactionFormValues = {
  date?: Date;
  description?: string;
  bookings: BookingValues[];
};
