import type { Unit } from "../../.prisma-client/enums";

export function toHoldingUnitIdentifier(input: {
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
}): string | null {
  if (input.unit === "CURRENCY") {
    return input.currency ? `currency:${input.currency.toUpperCase()}` : null;
  }
  if (input.unit === "CRYPTOCURRENCY") {
    return input.cryptocurrency
      ? `crypto:${input.cryptocurrency.toUpperCase()}`
      : null;
  }
  return input.symbol && input.tradeCurrency
    ? `security:${input.symbol.toUpperCase()}:${input.tradeCurrency.toUpperCase()}`
    : null;
}
