import { Unit } from "../.prisma-client/enums";

export type BookingUnitFieldsSource = {
  unit: Unit | null;
  currency?: string | null;
  cryptocurrency?: string | null;
  symbol?: string | null;
  tradeCurrency?: string | null;
};

export type BookingUnitFields = {
  unit: Unit;
  currency?: string;
  cryptocurrency?: string;
  symbol?: string;
  tradeCurrency?: string;
};

export function getBookingUnitFields(
  account: BookingUnitFieldsSource,
  accountRole = "account",
): BookingUnitFields {
  if (!account.unit) {
    throw new Error(`${accountRole} must define a unit.`);
  }

  if (account.unit === Unit.CURRENCY) {
    if (!account.currency) {
      throw new Error(`${accountRole} currency is missing.`);
    }
    return { unit: Unit.CURRENCY, currency: account.currency };
  }

  if (account.unit === Unit.CRYPTOCURRENCY) {
    if (!account.cryptocurrency) {
      throw new Error(`${accountRole} cryptocurrency is missing.`);
    }
    return {
      unit: Unit.CRYPTOCURRENCY,
      cryptocurrency: account.cryptocurrency,
    };
  }

  if (!account.symbol) {
    throw new Error(`${accountRole} symbol is missing.`);
  }
  if (!account.tradeCurrency) {
    throw new Error(`${accountRole} trade currency is missing.`);
  }

  return {
    unit: Unit.SECURITY,
    symbol: account.symbol,
    tradeCurrency: account.tradeCurrency,
  };
}
