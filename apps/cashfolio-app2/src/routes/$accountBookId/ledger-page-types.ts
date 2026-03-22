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

type AccountsServerModule = typeof import("../../server/accounts");
type LedgerServerModule = typeof import("../../server/ledger");

export type LedgerAccount = Awaited<
  ReturnType<LedgerServerModule["getAccountForLedger"]>
>;
export type LedgerBookings = Awaited<
  ReturnType<LedgerServerModule["getLedgerData"]>
>;
export type LedgerAccountOptionSource = Awaited<
  ReturnType<AccountsServerModule["getAccounts"]>
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
  tradeCurrency: string | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
};
