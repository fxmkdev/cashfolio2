import { Unit } from "../.prisma-client/enums";
import { currencyDisplayDecimals } from "./unit-format-currency-decimals";
import { cryptocurrencyDisplayDecimals } from "./unit-format-cryptocurrency-decimals";

const DEFAULT_CURRENCY_DISPLAY_DECIMALS = 2;
const DEFAULT_CRYPTOCURRENCY_DISPLAY_DECIMALS = 8;
const SECURITY_DISPLAY_DECIMALS = 0;
const CRYPTOCURRENCY_SYMBOL_ALIASES: Record<string, string> = {
  // Coinlayer uses BTC, while Kraken uses XBT.
  BTC: "XBT",
  // Coinlayer uses DOGE, while Kraken uses XDG.
  DOGE: "XDG",
};

function normalizeCode(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.toUpperCase();
}

export function getCurrencyDecimals(
  currency: string | null | undefined,
): number {
  const normalized = normalizeCode(currency);
  if (!normalized) {
    return DEFAULT_CURRENCY_DISPLAY_DECIMALS;
  }

  const decimals =
    currencyDisplayDecimals[normalized as keyof typeof currencyDisplayDecimals];
  return decimals ?? DEFAULT_CURRENCY_DISPLAY_DECIMALS;
}

export function getCryptocurrencyDecimals(
  cryptocurrency: string | null | undefined,
): number {
  const normalizedInput = normalizeCode(cryptocurrency);
  const normalized = normalizedInput
    ? (CRYPTOCURRENCY_SYMBOL_ALIASES[normalizedInput] ?? normalizedInput)
    : null;
  if (!normalized) {
    return DEFAULT_CRYPTOCURRENCY_DISPLAY_DECIMALS;
  }

  const decimals =
    cryptocurrencyDisplayDecimals[
      normalized as keyof typeof cryptocurrencyDisplayDecimals
    ];
  return decimals ?? DEFAULT_CRYPTOCURRENCY_DISPLAY_DECIMALS;
}

export function getUnitDisplayDecimals(args: {
  unit: Unit | null | undefined;
  currency?: string | null;
  cryptocurrency?: string | null;
}): number {
  if (args.unit === Unit.SECURITY) {
    return SECURITY_DISPLAY_DECIMALS;
  }

  if (args.unit === Unit.CURRENCY) {
    return getCurrencyDecimals(args.currency);
  }

  if (args.unit === Unit.CRYPTOCURRENCY) {
    return getCryptocurrencyDecimals(args.cryptocurrency);
  }

  return DEFAULT_CURRENCY_DISPLAY_DECIMALS;
}

export function createDisplayNumberFormatter(args: {
  locale?: string;
  decimals: number;
  style?: "decimal" | "currency";
  currency?: string;
}) {
  const locale = args.locale ?? "en-CH";

  if (args.style === "currency") {
    if (!args.currency) {
      throw new Error("currency is required when style is 'currency'.");
    }

    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: args.currency,
      minimumFractionDigits: args.decimals,
      maximumFractionDigits: args.decimals,
    });
  }

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: args.decimals,
    maximumFractionDigits: args.decimals,
  });
}

export function createRateNumberFormatter(args?: {
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}) {
  const locale = args?.locale ?? "en-CH";
  const minimumFractionDigits = args?.minimumFractionDigits ?? 2;
  const maximumFractionDigits = args?.maximumFractionDigits ?? 6;

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits,
    maximumFractionDigits,
  });
}
