import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
import type { MoneyInput } from "../../shared/money";
import { toMoney } from "../../shared/money";

export const HOLDING_ACCOUNT_ID = "holding-security";
export const SECOND_HOLDING_ACCOUNT_ID = "holding-security-2";
export const CASH_ACCOUNT_ID = "cash";
export const holdingAccounts = [
  {
    id: HOLDING_ACCOUNT_ID,
    unit: Unit.SECURITY,
    currency: null,
    cryptocurrency: null,
    symbol: "AAPL",
    tradeCurrency: "USD",
  },
  {
    id: SECOND_HOLDING_ACCOUNT_ID,
    unit: Unit.SECURITY,
    currency: null,
    cryptocurrency: null,
    symbol: "AAPL",
    tradeCurrency: "USD",
  },
] as const;
export function createHoldingBooking(args: {
  id: string;
  date: string;
  value: MoneyInput;
  accountId?: string;
}) {
  return {
    id: args.id,
    accountId: args.accountId ?? HOLDING_ACCOUNT_ID,
    date: new Date(args.date),
    value: toMoney(args.value),
    unit: Unit.SECURITY,
    currency: null,
    cryptocurrency: null,
    symbol: "AAPL",
    tradeCurrency: "USD",
    accountType: AccountType.BALANCE,
    equityAccountSubtype: null,
  } as const;
}

export function createHoldingCurrencyBooking(args: {
  id: string;
  accountId: string;
  date: string;
  value: MoneyInput;
  currency: string;
}) {
  return {
    id: args.id,
    accountId: args.accountId,
    date: new Date(args.date),
    value: toMoney(args.value),
    unit: Unit.CURRENCY,
    currency: args.currency,
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    accountType: AccountType.BALANCE,
    equityAccountSubtype: null,
  } as const;
}

export function createCashBooking(args: {
  id: string;
  date: string;
  value: MoneyInput;
}) {
  return {
    id: args.id,
    accountId: CASH_ACCOUNT_ID,
    date: new Date(args.date),
    value: toMoney(args.value),
    unit: Unit.CURRENCY,
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    accountType: AccountType.BALANCE,
    equityAccountSubtype: null,
  } as const;
}

export function createExplicitGainLossBooking(args: {
  id: string;
  date: string;
  value: MoneyInput;
}) {
  return {
    id: args.id,
    accountId: "equity-gainloss",
    date: new Date(args.date),
    value: toMoney(args.value),
    unit: Unit.CURRENCY,
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    accountType: AccountType.EQUITY,
    equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
  } as const;
}
