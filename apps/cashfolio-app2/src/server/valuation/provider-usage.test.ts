import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const writeProviderUsage = vi.hoisted(() => vi.fn());

vi.mock("./provider-usage-db.server", () => ({
  writeProviderUsage,
}));

import { recordValuationProviderRequest } from "./provider-usage";

describe("valuation provider usage recording", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeProviderUsage.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  test("stores normalized provider request usage without leaking secrets", async () => {
    await recordValuationProviderRequest({
      provider: "CURRENCYLAYER",
      unitType: "CURRENCY",
      outcome: "REQUEST_ERROR",
      requestReason: "INITIAL_PROBE",
      requestedAt: new Date("2026-03-28T12:34:56.000Z"),
      valuationDate: new Date("2026-03-28T18:00:00.000Z"),
      durationMs: 12.4,
      retryCount: 0,
      currency: " chf ",
      errorMessage: "failed access_key=secret-token",
    });

    expect(writeProviderUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "CURRENCYLAYER",
        unitType: "CURRENCY",
        outcome: "REQUEST_ERROR",
        requestReason: "INITIAL_PROBE",
        requestedAt: new Date("2026-03-28T12:34:56.000Z"),
        valuationDate: new Date("2026-03-28T00:00:00.000Z"),
        currency: "CHF",
        durationMs: 12,
        retryCount: 0,
        errorMessage: "failed access_key=[redacted]",
      }),
    );
  });

  test("does not throw when usage persistence fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    writeProviderUsage.mockRejectedValueOnce(
      new Error("postgresql://user:private-password@localhost/database"),
    );

    await expect(
      recordValuationProviderRequest({
        provider: "MARKETSTACK",
        unitType: "SECURITY",
        outcome: "RETRIEVED",
        requestReason: "RATE_LIMIT_RETRY",
        requestedAt: new Date("2026-03-28T12:34:56.000Z"),
        valuationDate: new Date("2026-03-28T00:00:00.000Z"),
        durationMs: 3,
        retryCount: 1,
        symbol: "AAPL",
        tradeCurrency: "USD",
      }),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(
      "private-password",
    );
    warnSpy.mockRestore();
  });

  test.each([
    [undefined, undefined],
    ["short message", "short message"],
    ["x".repeat(2_500), "x".repeat(2_000)],
    [
      `access_key=${"secret".repeat(500)} remaining message`,
      "access_key=[redacted] remaining message",
    ],
    [
      `${"x".repeat(1_985)} access_key=secret-token`,
      `${"x".repeat(1_985)} access_key=[redacted]`.slice(0, 2_000),
    ],
  ])("bounds sanitized errors (%#)", async (errorMessage, expected) => {
    await recordValuationProviderRequest({
      provider: "CURRENCYLAYER",
      unitType: "CURRENCY",
      outcome: "REQUEST_ERROR",
      requestReason: "INITIAL_PROBE",
      requestedAt: new Date(),
      valuationDate: new Date(),
      durationMs: 1,
      errorMessage,
    });
    expect(writeProviderUsage).toHaveBeenCalledWith(
      expect.objectContaining({ errorMessage: expected }),
    );
  });

  test("bounds a stalled write and handles its eventual rejection", async () => {
    vi.useFakeTimers();
    let rejectWrite!: (error: Error) => void;
    writeProviderUsage.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectWrite = reject;
      }),
    );
    const promise = recordValuationProviderRequest({
      provider: "CURRENCYLAYER",
      unitType: "CURRENCY",
      outcome: "RETRIEVED",
      requestReason: "INITIAL_PROBE",
      requestedAt: new Date(),
      valuationDate: new Date(),
      durationMs: 1,
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(promise).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    rejectWrite(new Error("late database failure"));
    await Promise.resolve();
  });
});
