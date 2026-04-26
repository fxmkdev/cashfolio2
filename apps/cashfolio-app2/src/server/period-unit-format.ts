import { Unit } from "../.prisma-client/enums";

export function normalizeUppercaseCode(value: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.toUpperCase();
}

export function formatUnitLabel(args: {
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
}): string {
  if (args.unit === Unit.CURRENCY) {
    return normalizeUppercaseCode(args.currency) ?? "UNKNOWN";
  }

  if (args.unit === Unit.CRYPTOCURRENCY) {
    return normalizeUppercaseCode(args.cryptocurrency) ?? "UNKNOWN";
  }

  const symbol = normalizeUppercaseCode(args.symbol) ?? "UNKNOWN";
  const tradeCurrency = normalizeUppercaseCode(args.tradeCurrency) ?? "UNKNOWN";
  return `${symbol} (${tradeCurrency})`;
}
