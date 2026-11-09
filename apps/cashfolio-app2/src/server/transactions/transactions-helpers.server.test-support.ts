import { vi } from "vitest";

import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";

const prisma = vi.hoisted(() => ({
  account: {
    findMany: vi.fn(),
  },
  accountBook: {
    findUniqueOrThrow: vi.fn(),
  },
}));

vi.mock("../../prisma.server", () => ({
  prisma,
}));

function createAccountMap(
  overrides?: Partial<Record<string, AccountTypeMeta>>,
) {
  const base = new Map<string, AccountTypeMeta>([
    [
      "income",
      {
        id: "income",
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.INCOME,
        unit: null,
      },
    ],
    [
      "expense",
      {
        id: "expense",
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.EXPENSE,
        unit: null,
      },
    ],
    [
      "opening",
      {
        id: "opening",
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
        unit: null,
      },
    ],
    [
      "gain-loss",
      {
        id: "gain-loss",
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
        unit: null,
      },
    ],
    [
      "asset",
      {
        id: "asset",
        type: AccountType.BALANCE,
        equityAccountSubtype: null,
        unit: Unit.CURRENCY,
        currency: "CHF",
      },
    ],
    [
      "liability",
      {
        id: "liability",
        type: AccountType.BALANCE,
        equityAccountSubtype: null,
        unit: Unit.CURRENCY,
        currency: "CHF",
      },
    ],
  ]);

  for (const [id, meta] of Object.entries(overrides ?? {})) {
    if (meta) {
      base.set(id, meta);
    }
  }

  return base;
}

const FIXED_SYSTEM_TIME = new Date("2026-02-01T12:00:00.000Z");
const resetTransactionHelpers = () => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_SYSTEM_TIME);
  vi.clearAllMocks();
  prisma.account.findMany.mockResolvedValue([]);
  prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
    startDate: new Date("2026-01-03T00:00:00.000Z"),
  });
};
const cleanupTransactionHelpers = () => {
  vi.useRealTimers();
};
export {
  accountTypeMeta,
  buildTransactionCreateData,
  cleanupTransactionHelpers,
  createAccountMap,
  GAIN_LOSS_SIMPLE_TRANSACTION_INVARIANT_MESSAGE,
  OPENING_BALANCES_MANAGEMENT_MESSAGE,
  prisma,
  resetTransactionHelpers,
  validateAccountTypeBookings,
  validateAccountTypeBookingsWithAccounts,
  validateCreateTransaction,
};

// Register mocks before importing the tested modules and their dependencies.
import type { AccountTypeMeta } from "./transactions-helpers.server";
const {
  accountTypeMeta,
  buildTransactionCreateData,
  validateAccountTypeBookings,
  validateAccountTypeBookingsWithAccounts,
  validateCreateTransaction,
} = await import("./transactions-helpers.server");
const { OPENING_BALANCES_MANAGEMENT_MESSAGE } =
  await import("../../shared/accounts/opening-balances");
const { GAIN_LOSS_SIMPLE_TRANSACTION_INVARIANT_MESSAGE } =
  await import("../../shared/transactions/gain-loss-transaction-invariant");
