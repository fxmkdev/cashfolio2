import type { getAccounts } from "../../server/accounts";
import type { getAccountForLedger, getLedgerData } from "../../server/ledger";
import { Unit } from "../../.prisma-client/enums";

export type LedgerSearch = { transactionId?: string };

export function parseLedgerSearch(
  search: Record<string, unknown>,
): LedgerSearch {
  return {
    transactionId:
      typeof search.transactionId === "string"
        ? search.transactionId
        : undefined,
  };
}

export type LedgerAccount = Awaited<ReturnType<typeof getAccountForLedger>>;
export type LedgerBookings = Awaited<ReturnType<typeof getLedgerData>>;
export type LedgerAccountOptionSource = Awaited<
  ReturnType<typeof getAccounts>
>[number];

export type LedgerRow = {
  id: string;
  transactionId: string;
  date: string;
  counterpartyAccounts: { id: string; name: string }[];
  description: string;
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
};
