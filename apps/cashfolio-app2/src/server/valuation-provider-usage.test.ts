import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { UserRole } from "../.prisma-client/enums";

const createServerFn = vi.hoisted(() =>
  vi.fn(() => ({
    handler: vi.fn((handler: () => unknown) => handler),
  })),
);
const ensureUserHasRole = vi.hoisted(() => vi.fn());
const prisma = vi.hoisted(() => ({
  valuationProviderRequest: {
    groupBy: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn,
}));

vi.mock("../users/functions.server", () => ({
  ensureUserHasRole,
}));

vi.mock("../prisma.server", () => ({
  prisma,
}));

import { getValuationProviderUsage } from "./valuation-provider-usage";

describe("valuation provider usage admin functions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T15:30:00.000Z"));
    vi.clearAllMocks();
    ensureUserHasRole.mockResolvedValue({
      id: "admin-user",
      roles: [UserRole.ADMIN],
    });
    prisma.valuationProviderRequest.groupBy.mockResolvedValue([]);
    prisma.valuationProviderRequest.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("requires Admin access", async () => {
    const error = new Response("Forbidden", { status: 403 });
    ensureUserHasRole.mockRejectedValueOnce(error);

    await expect(getValuationProviderUsage()).rejects.toBe(error);
    expect(ensureUserHasRole).toHaveBeenCalledWith(UserRole.ADMIN);
    expect(prisma.valuationProviderRequest.groupBy).not.toHaveBeenCalled();
  });

  test("returns summary windows and recent provider requests", async () => {
    prisma.valuationProviderRequest.groupBy
      .mockResolvedValueOnce([
        {
          provider: "MARKETSTACK",
          outcome: "RETRIEVED",
          requestReason: "INITIAL_PROBE",
          _count: { _all: 2 },
        },
      ])
      .mockResolvedValueOnce([
        {
          provider: "MARKETSTACK",
          outcome: "RETRIEVED",
          requestReason: "INITIAL_PROBE",
          _count: { _all: 3 },
        },
        {
          provider: "MARKETSTACK",
          outcome: "RATE_LIMIT_RETRY",
          requestReason: "RATE_LIMIT_RETRY",
          _count: { _all: 1 },
        },
      ])
      .mockResolvedValueOnce([
        {
          provider: "COINLAYER",
          outcome: "NO_DATA",
          requestReason: "BACKTRACK_PROBE",
          _count: { _all: 4 },
        },
      ]);
    prisma.valuationProviderRequest.findMany.mockResolvedValueOnce([
      {
        id: "request-1",
        provider: "MARKETSTACK",
        unitType: "SECURITY",
        outcome: "RETRIEVED",
        requestReason: "RATE_LIMIT_RETRY",
        requestedAt: new Date("2026-06-20T12:00:00.000Z"),
        valuationDate: new Date("2026-06-19T00:00:00.000Z"),
        currency: null,
        cryptocurrency: null,
        symbol: "AAPL",
        tradeCurrency: "USD",
        httpStatus: 200,
        durationMs: 42,
        retryCount: 1,
        errorMessage: null,
      },
    ]);

    const result = await getValuationProviderUsage();

    expect(ensureUserHasRole).toHaveBeenCalledWith(UserRole.ADMIN);
    expect(prisma.valuationProviderRequest.groupBy).toHaveBeenCalledTimes(3);
    expect(prisma.valuationProviderRequest.groupBy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          requestedAt: {
            gte: new Date("2026-06-20T00:00:00.000Z"),
          },
        },
      }),
    );
    expect(prisma.valuationProviderRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { requestedAt: "desc" },
        take: 100,
      }),
    );
    expect(result.summaryWindows).toEqual([
      expect.objectContaining({
        key: "today",
        totalCount: 2,
        byProvider: [{ key: "MARKETSTACK", count: 2 }],
      }),
      expect.objectContaining({
        key: "last7Days",
        totalCount: 4,
        byOutcome: [
          { key: "RATE_LIMIT_RETRY", count: 1 },
          { key: "RETRIEVED", count: 3 },
        ],
      }),
      expect.objectContaining({
        key: "last30Days",
        totalCount: 4,
        byReason: [{ key: "BACKTRACK_PROBE", count: 4 }],
      }),
    ]);
    expect(result.recentRequests).toEqual([
      expect.objectContaining({
        id: "request-1",
        requestedAt: "2026-06-20T12:00:00.000Z",
        valuationDate: "2026-06-19T00:00:00.000Z",
        unitLabel: "AAPL (USD)",
        retryCount: 1,
      }),
    ]);
  });
});
