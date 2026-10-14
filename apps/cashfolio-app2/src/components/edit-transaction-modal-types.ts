import type { Unit } from "../.prisma-client/enums";

export type { AccountOption } from "../shared/account-options";

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
