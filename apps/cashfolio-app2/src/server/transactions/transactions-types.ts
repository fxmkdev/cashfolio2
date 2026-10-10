import type { Unit } from "../../.prisma-client/enums";

export type CreateTransactionInput<Amount = number> = {
  accountBookId: string;
  description: string;
  bookings: {
    date: string;
    accountId: string;
    description: string;
    unit: Unit;
    currency?: string;
    cryptocurrency?: string;
    symbol?: string;
    tradeCurrency?: string;
    value: Amount;
  }[];
};

export type CreateTransactionsInput = {
  accountBookId: string;
  transactions: Omit<CreateTransactionInput, "accountBookId">[];
};

export type CreateSimpleTransactionInput = {
  accountBookId: string;
  accountId: string;
  date: string;
  description: string;
  counterAccountId: string;
  amount: number;
  direction: "DEBIT" | "CREDIT";
};

export type RebookBookingInput = {
  accountBookId: string;
  bookingId: string;
  targetAccountId: string;
};
