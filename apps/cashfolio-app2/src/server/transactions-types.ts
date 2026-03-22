import type { Unit } from "../.prisma-client/enums";

export type CreateTransactionInput = {
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
    value: number;
  }[];
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
