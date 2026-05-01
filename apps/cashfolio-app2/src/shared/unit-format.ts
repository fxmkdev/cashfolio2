import { Unit } from "../.prisma-client/enums";

const DEFAULT_CURRENCY_DISPLAY_DECIMALS = 2;
const DEFAULT_CRYPTOCURRENCY_DISPLAY_DECIMALS = 8;
const SECURITY_DISPLAY_DECIMALS = 0;

// Source: ISO 4217 List One (SIX maintenance agency), published 2026-01-01.
// URL: https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml
// This map intentionally covers the currencies present in src/currencies.ts where
// the ISO list provides numeric minor units. Unsupported/non-ISO entries fall back
// to DEFAULT_CURRENCY_DISPLAY_DECIMALS.
export const currencyDisplayDecimals = {
  AED: 2,
  AFN: 2,
  ALL: 2,
  AMD: 2,
  AOA: 2,
  ARS: 2,
  AUD: 2,
  AWG: 2,
  AZN: 2,
  BAM: 2,
  BBD: 2,
  BDT: 2,
  BHD: 3,
  BIF: 0,
  BMD: 2,
  BND: 2,
  BOB: 2,
  BRL: 2,
  BSD: 2,
  BTN: 2,
  BWP: 2,
  BYN: 2,
  BZD: 2,
  CAD: 2,
  CDF: 2,
  CHF: 2,
  CLF: 4,
  CLP: 0,
  CNY: 2,
  COP: 2,
  CRC: 2,
  CUP: 2,
  CVE: 2,
  CZK: 2,
  DJF: 0,
  DKK: 2,
  DOP: 2,
  DZD: 2,
  EGP: 2,
  ERN: 2,
  ETB: 2,
  EUR: 2,
  FJD: 2,
  FKP: 2,
  GBP: 2,
  GEL: 2,
  GHS: 2,
  GIP: 2,
  GMD: 2,
  GNF: 0,
  GTQ: 2,
  GYD: 2,
  HKD: 2,
  HNL: 2,
  HTG: 2,
  HUF: 2,
  IDR: 2,
  ILS: 2,
  INR: 2,
  IQD: 3,
  IRR: 2,
  ISK: 0,
  JMD: 2,
  JOD: 3,
  JPY: 0,
  KES: 2,
  KGS: 2,
  KHR: 2,
  KMF: 0,
  KPW: 2,
  KRW: 0,
  KWD: 3,
  KYD: 2,
  KZT: 2,
  LAK: 2,
  LBP: 2,
  LKR: 2,
  LRD: 2,
  LSL: 2,
  LYD: 3,
  MAD: 2,
  MDL: 2,
  MGA: 2,
  MKD: 2,
  MMK: 2,
  MNT: 2,
  MOP: 2,
  MRU: 2,
  MUR: 2,
  MVR: 2,
  MWK: 2,
  MXN: 2,
  MYR: 2,
  MZN: 2,
  NAD: 2,
  NGN: 2,
  NIO: 2,
  NOK: 2,
  NPR: 2,
  NZD: 2,
  OMR: 3,
  PAB: 2,
  PEN: 2,
  PGK: 2,
  PHP: 2,
  PKR: 2,
  PLN: 2,
  PYG: 0,
  QAR: 2,
  RON: 2,
  RSD: 2,
  RUB: 2,
  RWF: 0,
  SAR: 2,
  SBD: 2,
  SCR: 2,
  SDG: 2,
  SEK: 2,
  SGD: 2,
  SHP: 2,
  SLE: 2,
  SOS: 2,
  SRD: 2,
  STN: 2,
  SVC: 2,
  SYP: 2,
  SZL: 2,
  THB: 2,
  TJS: 2,
  TMT: 2,
  TND: 3,
  TOP: 2,
  TRY: 2,
  TTD: 2,
  TWD: 2,
  TZS: 2,
  UAH: 2,
  UGX: 0,
  USD: 2,
  UYU: 2,
  UZS: 2,
  VES: 2,
  VND: 0,
  VUV: 0,
  WST: 2,
  XAF: 0,
  XCD: 2,
  XCG: 2,
  XOF: 0,
  XPF: 0,
  YER: 2,
  ZAR: 2,
  ZMW: 2,
} as const;

// Source: Kraken REST Assets metadata (display_decimals), captured 2026-05-01.
// Reference docs: https://support.kraken.com/articles/360000920306-api-symbols-and-tickers
// Endpoint: https://api.kraken.com/0/public/Assets
// This map covers symbols present in src/cryptocurrencies.ts that Kraken exposes.
// Uncovered symbols fall back to DEFAULT_CRYPTOCURRENCY_DISPLAY_DECIMALS.
export const cryptocurrencyDisplayDecimals = {
  ACT: 3,
  ADA: 6,
  ADX: 5,
  AIR: 5,
  ALT: 3,
  ARC: 3,
  AVAX: 5,
  AVT: 4,
  BAT: 5,
  BCH: 5,
  BIO: 3,
  BLZ: 3,
  BNB: 5,
  BNT: 5,
  CAT: 1,
  CVC: 5,
  DASH: 5,
  DEEP: 2,
  DENT: 5,
  ENJ: 5,
  EOS: 5,
  ETC: 5,
  ETH: 5,
  FUN: 2,
  GMX: 5,
  GNO: 5,
  GTC: 5,
  ICX: 5,
  KIN: 5,
  KNC: 5,
  LINK: 5,
  LRC: 5,
  LSK: 5,
  LTC: 5,
  MANA: 5,
  MKR: 5,
  MLN: 5,
  NMR: 5,
  OMG: 5,
  OMNI: 5,
  OXY: 5,
  POWR: 5,
  PRO: 3,
  QTUM: 6,
  REP: 5,
  REQ: 5,
  RLC: 5,
  SC: 5,
  SENT: 2,
  SOL: 5,
  SPK: 2,
  STORJ: 5,
  STX: 3,
  TRUMP: 4,
  TRX: 6,
  USDT: 4,
  WINGS: 1,
  XLM: 5,
  XMR: 5,
  XRP: 5,
  XTZ: 6,
  ZEC: 5,
  ZRX: 5,
} as const;

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
  const normalized = normalizeCode(cryptocurrency);
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

export function createEntryNumberFormatter(locale = "en-CH") {
  return new Intl.NumberFormat(locale);
}
