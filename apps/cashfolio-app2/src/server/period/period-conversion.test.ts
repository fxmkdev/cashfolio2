import type { Money } from "../../shared/money";
import { toMoney } from "../../shared/money";
import { toNumericMoney } from "../money-boundary";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Unit } from "../../.prisma-client/enums";
import type { DecimalValuationRateLookupResult } from "../valuation/types";

const getCurrencyExchangeRate = vi.hoisted(() =>
  vi.fn<
    (args: {
      sourceCurrency: string;
      targetCurrency: string;
      date: Date;
    }) => Promise<Money | null>
  >(),
);
const getCurrencyExchangeRateDetails = vi.hoisted(() =>
  vi.fn<
    (args: {
      sourceCurrency: string;
      targetCurrency: string;
      date: Date;
    }) => Promise<DecimalValuationRateLookupResult>
  >(),
);
const getCryptocurrencyToCurrencyExchangeRate = vi.hoisted(() =>
  vi.fn<
    (args: {
      cryptocurrency: string;
      targetCurrency: string;
      date: Date;
    }) => Promise<Money | null>
  >(),
);
const getCryptocurrencyToCurrencyExchangeRateDetails = vi.hoisted(() =>
  vi.fn<
    (args: {
      cryptocurrency: string;
      targetCurrency: string;
      date: Date;
    }) => Promise<DecimalValuationRateLookupResult>
  >(),
);
const getSecurityToCurrencyExchangeRate = vi.hoisted(() =>
  vi.fn<
    (args: {
      symbol: string;
      tradeCurrency: string;
      targetCurrency: string;
      date: Date;
    }) => Promise<Money | null>
  >(),
);
const getSecurityToCurrencyExchangeRateDetails = vi.hoisted(() =>
  vi.fn<
    (args: {
      symbol: string;
      tradeCurrency: string;
      targetCurrency: string;
      date: Date;
    }) => Promise<DecimalValuationRateLookupResult>
  >(),
);

vi.mock("../valuation.server", () => ({
  getCurrencyExchangeRate,
  getCurrencyExchangeRateDetails,
  getCryptocurrencyToCurrencyExchangeRate,
  getCryptocurrencyToCurrencyExchangeRateDetails,
  getSecurityToCurrencyExchangeRate,
  getSecurityToCurrencyExchangeRateDetails,
}));

import {
  convertBookingValueToReference,
  convertBookingValueToReferenceDetails,
  getUnitToReferenceExchangeRate,
  getUnitToReferenceExchangeRateDetails,
} from "./period-conversion";

const date = new Date("2026-04-05T12:34:56.000Z");

describe("getUnitToReferenceExchangeRate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrencyExchangeRate.mockResolvedValue(toMoney(0.9));
    getCryptocurrencyToCurrencyExchangeRate.mockResolvedValue(toMoney(50_000));
    getSecurityToCurrencyExchangeRate.mockResolvedValue(toMoney(123.45));
  });

  it("returns identity rates without calling valuation providers", async () => {
    const result = await getUnitToReferenceExchangeRate({
      unit: Unit.CURRENCY,
      currency: "chf",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      date,
      referenceCurrency: "CHF",
      exchangeRateByKey: new Map(),
    });

    expect(toNumericMoney(result)).toBe(1);
    expect(getCurrencyExchangeRate).not.toHaveBeenCalled();
  });

  it("returns null when required unit metadata is missing", async () => {
    await expect(
      getUnitToReferenceExchangeRate({
        unit: Unit.CURRENCY,
        currency: null,
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        date,
        referenceCurrency: "CHF",
        exchangeRateByKey: new Map(),
      }).then(toNumericMoney),
    ).resolves.toBeNull();
    await expect(
      getUnitToReferenceExchangeRate({
        unit: Unit.CRYPTOCURRENCY,
        currency: null,
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        date,
        referenceCurrency: "CHF",
        exchangeRateByKey: new Map(),
      }).then(toNumericMoney),
    ).resolves.toBeNull();
    await expect(
      getUnitToReferenceExchangeRate({
        unit: Unit.SECURITY,
        currency: null,
        cryptocurrency: null,
        symbol: "AAPL",
        tradeCurrency: null,
        date,
        referenceCurrency: "CHF",
        exchangeRateByKey: new Map(),
      }).then(toNumericMoney),
    ).resolves.toBeNull();
  });

  it("looks up and caches currency exchange rates by uppercase key and date", async () => {
    const exchangeRateByKey = new Map<string, Promise<Money | null>>();
    const input = {
      unit: Unit.CURRENCY,
      currency: "usd",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      date,
      referenceCurrency: "CHF",
      exchangeRateByKey,
    };

    await expect(
      getUnitToReferenceExchangeRate(input).then(toNumericMoney),
    ).resolves.toBe(0.9);
    await expect(
      getUnitToReferenceExchangeRate(input).then(toNumericMoney),
    ).resolves.toBe(0.9);

    expect(getCurrencyExchangeRate).toHaveBeenCalledTimes(1);
    expect(getCurrencyExchangeRate).toHaveBeenCalledWith({
      sourceCurrency: "USD",
      targetCurrency: "CHF",
      date,
    });
    expect(exchangeRateByKey.has("currency:USD:CHF:2026-04-05")).toBe(true);
  });

  it("looks up cryptocurrency and security rates", async () => {
    await expect(
      getUnitToReferenceExchangeRate({
        unit: Unit.CRYPTOCURRENCY,
        currency: null,
        cryptocurrency: "btc",
        symbol: null,
        tradeCurrency: null,
        date,
        referenceCurrency: "CHF",
        exchangeRateByKey: new Map(),
      }).then(toNumericMoney),
    ).resolves.toBe(50_000);
    await expect(
      getUnitToReferenceExchangeRate({
        unit: Unit.SECURITY,
        currency: null,
        cryptocurrency: null,
        symbol: "aapl",
        tradeCurrency: "usd",
        date,
        referenceCurrency: "CHF",
        exchangeRateByKey: new Map(),
      }).then(toNumericMoney),
    ).resolves.toBe(123.45);

    expect(getCryptocurrencyToCurrencyExchangeRate).toHaveBeenCalledWith({
      cryptocurrency: "BTC",
      targetCurrency: "CHF",
      date,
    });
    expect(getSecurityToCurrencyExchangeRate).toHaveBeenCalledWith({
      symbol: "AAPL",
      tradeCurrency: "USD",
      targetCurrency: "CHF",
      date,
    });
  });
});

describe("getUnitToReferenceExchangeRateDetails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrencyExchangeRateDetails.mockResolvedValue({
      rate: toMoney(0.9),
      source: "timeSeries",
    });
    getCryptocurrencyToCurrencyExchangeRateDetails.mockResolvedValue({
      rate: toMoney(50_000),
      source: "provider",
    });
    getSecurityToCurrencyExchangeRateDetails.mockResolvedValue({
      rate: toMoney(123.45),
      source: "fallback",
    });
  });

  it("returns identity and missing details without provider calls", async () => {
    await expect(
      getUnitToReferenceExchangeRateDetails({
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        date,
        referenceCurrency: "CHF",
        exchangeRateByKey: new Map(),
      }).then(toNumericMoney),
    ).resolves.toEqual({ rate: 1, source: "identity" });
    await expect(
      getUnitToReferenceExchangeRateDetails({
        unit: Unit.SECURITY,
        currency: null,
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: "USD",
        date,
        referenceCurrency: "CHF",
        exchangeRateByKey: new Map(),
      }).then(toNumericMoney),
    ).resolves.toEqual({ rate: null, source: "missing" });

    expect(getCurrencyExchangeRateDetails).not.toHaveBeenCalled();
    expect(getSecurityToCurrencyExchangeRateDetails).not.toHaveBeenCalled();
  });

  it("looks up and caches detailed currency exchange rates", async () => {
    const exchangeRateByKey = new Map<
      string,
      Promise<DecimalValuationRateLookupResult>
    >();
    const input = {
      unit: Unit.CURRENCY,
      currency: "eur",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      date,
      referenceCurrency: "CHF",
      exchangeRateByKey,
    };

    await expect(
      getUnitToReferenceExchangeRateDetails(input).then(toNumericMoney),
    ).resolves.toEqual({
      rate: 0.9,
      source: "timeSeries",
    });
    await expect(
      getUnitToReferenceExchangeRateDetails(input).then(toNumericMoney),
    ).resolves.toEqual({
      rate: 0.9,
      source: "timeSeries",
    });

    expect(getCurrencyExchangeRateDetails).toHaveBeenCalledTimes(1);
    expect(exchangeRateByKey.has("currency:EUR:CHF:2026-04-05")).toBe(true);
  });

  it("looks up detailed cryptocurrency and security rates", async () => {
    await expect(
      getUnitToReferenceExchangeRateDetails({
        unit: Unit.CRYPTOCURRENCY,
        currency: null,
        cryptocurrency: "eth",
        symbol: null,
        tradeCurrency: null,
        date,
        referenceCurrency: "CHF",
        exchangeRateByKey: new Map(),
      }).then(toNumericMoney),
    ).resolves.toEqual({ rate: 50_000, source: "provider" });
    await expect(
      getUnitToReferenceExchangeRateDetails({
        unit: Unit.SECURITY,
        currency: null,
        cryptocurrency: null,
        symbol: "msft",
        tradeCurrency: "usd",
        date,
        referenceCurrency: "CHF",
        exchangeRateByKey: new Map(),
      }).then(toNumericMoney),
    ).resolves.toEqual({ rate: 123.45, source: "fallback" });

    expect(getCryptocurrencyToCurrencyExchangeRateDetails).toHaveBeenCalledWith(
      {
        cryptocurrency: "ETH",
        targetCurrency: "CHF",
        date,
      },
    );
    expect(getSecurityToCurrencyExchangeRateDetails).toHaveBeenCalledWith({
      symbol: "MSFT",
      tradeCurrency: "USD",
      targetCurrency: "CHF",
      date,
    });
  });
});

describe("convertBookingValueToReference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrencyExchangeRate.mockResolvedValue(toMoney(0.9));
  });

  it("short-circuits zero and identity currency conversions", async () => {
    await expect(
      convertBookingValueToReference({
        value: toMoney(0),
        unit: Unit.SECURITY,
        currency: null,
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        date,
        referenceCurrency: "CHF",
        exchangeRateByKey: new Map(),
      }).then(toNumericMoney),
    ).resolves.toBe(0);
    await expect(
      convertBookingValueToReference({
        value: toMoney(12.34),
        unit: Unit.CURRENCY,
        currency: "chf",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        date,
        referenceCurrency: "CHF",
        exchangeRateByKey: new Map(),
      }).then(toNumericMoney),
    ).resolves.toBe(12.34);

    expect(getCurrencyExchangeRate).not.toHaveBeenCalled();
  });

  it("converts values and preserves null when rates are unavailable", async () => {
    const exchangeRateByKey = new Map<string, Promise<Money | null>>();

    await expect(
      convertBookingValueToReference({
        value: toMoney(10),
        unit: Unit.CURRENCY,
        currency: "USD",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        date,
        referenceCurrency: "CHF",
        exchangeRateByKey,
      }).then(toNumericMoney),
    ).resolves.toBe(9);

    getCurrencyExchangeRate.mockResolvedValueOnce(null);

    await expect(
      convertBookingValueToReference({
        value: toMoney(10),
        unit: Unit.CURRENCY,
        currency: "EUR",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        date,
        referenceCurrency: "CHF",
        exchangeRateByKey,
      }).then(toNumericMoney),
    ).resolves.toBeNull();
  });
});

describe("convertBookingValueToReferenceDetails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrencyExchangeRateDetails.mockResolvedValue({
      rate: toMoney(0.9),
      source: "timeSeries",
    });
  });

  it("short-circuits zero and identity currency conversions with identity source", async () => {
    await expect(
      convertBookingValueToReferenceDetails({
        value: toMoney(0),
        unit: Unit.SECURITY,
        currency: null,
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        date,
        referenceCurrency: "CHF",
        exchangeRateByKey: new Map(),
      }).then(toNumericMoney),
    ).resolves.toEqual({ value: 0, source: "identity" });
    await expect(
      convertBookingValueToReferenceDetails({
        value: toMoney(12.34),
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        date,
        referenceCurrency: "CHF",
        exchangeRateByKey: new Map(),
      }).then(toNumericMoney),
    ).resolves.toEqual({ value: 12.34, source: "identity" });
  });

  it("converts values and carries rate lookup source details", async () => {
    await expect(
      convertBookingValueToReferenceDetails({
        value: toMoney(10),
        unit: Unit.CURRENCY,
        currency: "USD",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        date,
        referenceCurrency: "CHF",
        exchangeRateByKey: new Map(),
      }).then(toNumericMoney),
    ).resolves.toEqual({ value: 9, source: "timeSeries" });

    getCurrencyExchangeRateDetails.mockResolvedValueOnce({
      rate: null,
      source: "missing",
    });

    await expect(
      convertBookingValueToReferenceDetails({
        value: toMoney(10),
        unit: Unit.CURRENCY,
        currency: "EUR",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        date,
        referenceCurrency: "CHF",
        exchangeRateByKey: new Map(),
      }).then(toNumericMoney),
    ).resolves.toEqual({ value: null, source: "missing" });
  });
});
