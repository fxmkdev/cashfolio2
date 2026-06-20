import { beforeEach, describe, expect, test, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  valuationProviderRequest: {
    create: vi.fn(),
  },
}));

vi.mock("../../prisma.server", () => ({
  prisma,
}));

import { recordValuationProviderRequest } from "./provider-usage";

describe("valuation provider usage recording", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.valuationProviderRequest.create.mockResolvedValue({});
  });

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

    expect(prisma.valuationProviderRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
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
    });
  });

  test("does not throw when usage persistence fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    prisma.valuationProviderRequest.create.mockRejectedValueOnce(
      new Error("database unavailable"),
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
    warnSpy.mockRestore();
  });
});
