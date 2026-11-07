import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toMoney } from "../../shared/money";
import { decodeMoneyCache } from "../money-cache-codec";
import { isAccountGainLossBasisCacheData } from "./account-gain-loss-basis-cache-data";

const mocks = vi.hoisted(() => ({
  entries: new Map<string, string>(),
  redis: vi.fn(),
  snapshot: vi.fn(),
  db: {
    $executeRaw: vi.fn(),
    accountBook: { findUniqueOrThrow: vi.fn() },
    account: { findMany: vi.fn() },
    accountGroup: { findMany: vi.fn() },
    booking: { findFirst: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    transaction: { findMany: vi.fn() },
  },
  rate: vi.fn(),
  conversion: vi.fn(),
}));
vi.mock("../../prisma.server", () => ({
  prisma: { ...mocks.db, $transaction: mocks.snapshot },
}));
vi.mock("../../redis.server", () => ({ getRedisClient: mocks.redis }));
vi.mock("../period/period-conversion", () => ({
  getUnitToReferenceExchangeRateDetails: mocks.rate,
  convertBookingValueToReferenceDetails: mocks.conversion,
}));
import {
  queryAccountGainLoss,
  queryAccountGainLossSummaries,
  queryAccountRecordedGainLossEligibility,
} from "./account-gain-loss.server";

const portfolio = {
  id: "portfolio",
  name: "Portfolio",
  type: "BALANCE" as const,
  isActive: true,
  groupId: "group",
  unit: "CURRENCY" as const,
  currency: "CHF",
  cryptocurrency: null,
  symbol: null,
  tradeCurrency: null,
};
function adjustment(
  id: string,
  date: string,
  amount: string,
  accountId = "portfolio",
  counterpartDate = date,
) {
  return {
    id,
    description: `Statement ${id}`,
    bookings: [
      {
        ...portfolio,
        id: `${id}:balance`,
        accountId,
        date: new Date(counterpartDate),
        value: amount,
        description: null,
        account: {
          type: "BALANCE",
          equityAccountSubtype: null,
          name: accountId,
        },
      },
      {
        ...portfolio,
        id: `${id}:equity`,
        accountId: "gain-loss",
        date: new Date(date),
        value: toMoney(amount).neg().toString(),
        description: `Adjustment ${id}`,
        account: {
          id: "gain-loss",
          type: "EQUITY",
          equityAccountSubtype: "GAIN_LOSS",
          name: "Gain/Loss",
          groupId: null,
        },
      },
    ],
  };
}
let transactions: ReturnType<typeof adjustment>[];
let currency: string;
let conversionMissing: boolean;
const basisKey =
  "account:gain-loss-basis:v4:test:book:revision:2026-03-01T00:00:00.000Z";
const ledger = (includeDetails = true, period?: string) =>
  queryAccountGainLoss({
    accountBookId: "book",
    accountId: "portfolio",
    includeDetails,
    period,
  });
const list = (accountState: "active" | "inactive" | "all" = "all") =>
  queryAccountGainLossSummaries({
    accountBookId: "book",
    type: "BALANCE",
    accountState,
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-12T12:00:00Z"));
  vi.stubEnv("PERIOD_BASE_CACHE_ENV", "test");
  transactions = [adjustment("gain", "2026-03-01Z", "100")];
  currency = "CHF";
  conversionMissing = false;
  mocks.entries.clear();
  mocks.snapshot.mockImplementation(async (read) => read(mocks.db));
  mocks.redis.mockResolvedValue({
    get: async (key: string) => mocks.entries.get(key) ?? null,
    setEx: async (key: string, _ttl: number, value: string) => {
      mocks.entries.set(key, value);
    },
  });
  mocks.db.accountBook.findUniqueOrThrow.mockResolvedValue({
    referenceCurrency: "CHF",
    startDate: new Date("2026-01-01Z"),
    periodCacheRevision: "revision",
  });
  mocks.db.account.findMany.mockImplementation(async ({ where }) =>
    where.type === "EQUITY"
      ? []
      : [
          { ...portfolio, currency },
          { ...portfolio, id: "ordinary", currency: "CHF" },
        ],
  );
  mocks.db.accountGroup.findMany.mockResolvedValue([
    { id: "group", parentGroupId: null, type: "BALANCE", isActive: true },
  ]);
  mocks.db.booking.groupBy.mockImplementation(async () =>
    currency === "CHF"
      ? []
      : [{ accountId: "portfolio", _sum: { value: "1000" } }],
  );
  mocks.db.booking.findFirst.mockImplementation(async ({ where }) => {
    const dates = transactions
      .flatMap((tx) => tx.bookings.map((booking) => booking.date))
      .filter((date) => date < where.date.lt);
    return dates.length
      ? { date: new Date(Math.max(...dates.map((date) => date.getTime()))) }
      : null;
  });
  mocks.db.booking.findMany.mockImplementation(async ({ where }) => {
    if (where.transactionId)
      return transactions
        .filter((tx) => where.transactionId.in.includes(tx.id))
        .flatMap((tx) =>
          tx.bookings
            .filter((b) => b.account.type === "BALANCE")
            .map((b) => ({
              transactionId: tx.id,
              accountId: b.accountId,
              account: { name: b.account.name },
            })),
        );
    if (where.account)
      return transactions.flatMap((tx) =>
        tx.bookings
          .filter(
            (b) =>
              b.account.type === "EQUITY" &&
              b.account.equityAccountSubtype === "GAIN_LOSS" &&
              b.date >= where.date.gte &&
              b.date < where.date.lt,
          )
          .map((b) => ({
            ...b,
            currency,
            transactionId: tx.id,
            transaction: { description: tx.description },
          })),
      );
    return [];
  });
  mocks.db.transaction.findMany.mockImplementation(async ({ where }) => {
    const range = where.AND[0].bookings.some.date;
    return transactions
      .filter(
        (tx) =>
          tx.bookings.every((b) => b.date < range.lt) &&
          tx.bookings.some(
            (b) => b.account.type === "BALANCE" && b.date >= range.gte,
          ),
      )
      .map((tx) => ({
        ...tx,
        bookings: tx.bookings.map((b) => ({ ...b, currency })),
      }));
  });
  mocks.rate.mockImplementation(async ({ date }) => ({
    rate: toMoney(date.getTime() === Date.parse("2025-12-31Z") ? 1 : 1.2),
    source: "timeSeries",
  }));
  mocks.conversion.mockImplementation(async (booking) => ({
    value: conversionMissing
      ? null
      : toMoney(booking.value).mul(currency === "CHF" ? 1 : 1.1),
    source: conversionMissing
      ? "missing"
      : currency === "CHF"
        ? "identity"
        : "timeSeries",
  }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("recorded G/L through since-start summaries and real FIFO replay", () => {
  it.each(["100", "-35", "0.100000000000000001"])(
    "includes %s recorded G/L and explains it separately from FIFO",
    async (amount) => {
      transactions = [adjustment("gain", "2026-03-01Z", amount)];
      const response = await ledger();
      expect(response.applicable).toBe(true);
      expect(response.summary).toEqual({
        realizedGainLoss: Number(amount),
        unrealizedGainLoss: 0,
        totalGainLoss: Number(amount),
      });
      expect(response.realizedEvents).toEqual([]);
      expect(response.recordedAdjustments).toEqual([
        expect.objectContaining({
          transactionId: "gain",
          description: "Adjustment gain",
          amount: Number(amount),
        }),
      ]);
      const summaries = await list();
      expect(summaries.total.summary).toEqual(response.summary);
      expect(
        summaries.rows.find((row) => row.id === "ordinary")?.applicable,
      ).toBe(false);
      expect(summaries.rows.find((row) => row.id === "group")?.summary).toEqual(
        response.summary,
      );
      expect(
        [...mocks.entries.values()].some((entry) => entry.includes(amount)),
      ).toBe(true);
    },
  );

  it("retains eligibility when recorded adjustments offset exactly", async () => {
    transactions.push(adjustment("loss", "2026-03-02Z", "-100"));
    const result = await ledger(false);
    expect(result.applicable).toBe(true);
    expect(result.summary.totalGainLoss).toBe(0);
    expect(
      await queryAccountRecordedGainLossEligibility({
        accountBookId: "book",
        accountId: "portfolio",
      }),
    ).toBe(true);
  });

  it("combines booking-date converted performance with FX gains without double counting", async () => {
    currency = "USD";
    const result = await ledger();
    expect(result.summary).toEqual({
      realizedGainLoss: 110,
      unrealizedGainLoss: 210,
      totalGainLoss: 320,
    });
    expect(result.recordedAdjustments[0]?.amount).toBe(110);
    expect(mocks.conversion).toHaveBeenCalledWith(
      expect.objectContaining({
        date: new Date("2026-03-01Z"),
        currency: "USD",
      }),
    );
    expect((await ledger(false)).summary).toEqual(result.summary);
    const conversions = mocks.conversion.mock.calls.length;
    expect((await ledger(false)).summary).toEqual(result.summary);
    expect(mocks.conversion).toHaveBeenCalledTimes(conversions);
    expect((await list()).total.summary).toEqual(result.summary);
  });

  it("combines recorded losses with calculated realised and unrealised FX", async () => {
    currency = "USD";
    transactions = [adjustment("loss", "2026-03-01Z", "-100")];
    const result = await ledger();
    expect(result.summary).toEqual({
      realizedGainLoss: -100,
      unrealizedGainLoss: 180,
      totalGainLoss: 80,
    });
    expect(result.recordedAdjustments[0]?.amount).toBe(-110);
    expect(
      result.realizedEvents.some((event) => event.realizedGainLossDelta === 10),
    ).toBe(true);
  });

  it("keeps recorded Realised available when the closing FX rate is missing", async () => {
    currency = "USD";
    mocks.rate.mockImplementation(async ({ date }) =>
      date.getTime() === Date.parse("2025-12-31Z")
        ? { rate: toMoney(1), source: "timeSeries" }
        : { rate: null, source: "missing" },
    );
    expect((await ledger(false)).summary).toEqual({
      realizedGainLoss: 110,
      unrealizedGainLoss: null,
      totalGainLoss: null,
    });
    expect(mocks.entries.has(basisKey)).toBe(true);
  });

  it("excludes income and opening equity bookings from recorded G/L", async () => {
    const income = adjustment("income", "2026-03-02Z", "50");
    income.bookings[1]!.account.equityAccountSubtype = "INCOME";
    const opening = adjustment("opening", "2026-03-03Z", "1000");
    opening.bookings[1]!.account.equityAccountSubtype = "OPENING_BALANCES";
    transactions.push(income, opening);
    expect((await ledger()).summary.totalGainLoss).toBe(100);
    expect(mocks.db.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          account: {
            type: "EQUITY",
            equityAccountSubtype: { in: ["GAIN_LOSS"] },
          },
        }),
      }),
    );
  });

  it("respects equity booking boundaries independently of counterpart dates", async () => {
    transactions = [
      adjustment("before", "2025-12-31Z", "900"),
      adjustment("start", "2026-01-01Z", "10"),
      adjustment("end", "2026-02-28Z", "20", "portfolio", "2026-03-05Z"),
      adjustment("future", "2026-03-01Z", "30"),
    ];
    const result = await ledger(true, "2026-02");
    expect(result.summary.totalGainLoss).toBe(30);
    expect(result.recordedAdjustments.map((row) => row.transactionId)).toEqual([
      "start",
      "end",
    ]);
    expect(
      await queryAccountRecordedGainLossEligibility({
        accountBookId: "book",
        accountId: "portfolio",
        period: "2025",
      }),
    ).toBe(false);
    expect((await ledger(false, "2025")).applicable).toBe(false);
  });

  it("withholds incomplete recorded totals, retains unrealised, and retries after conversion recovers", async () => {
    conversionMissing = true;
    const result = await ledger(false);
    expect(result.applicable).toBe(true);
    expect(result.summary).toEqual({
      realizedGainLoss: null,
      unrealizedGainLoss: 0,
      totalGainLoss: null,
    });
    expect(result.diagnostics[0]?.message).toContain("recorded G/L");
    expect(mocks.entries.size).toBe(0);
    conversionMissing = false;
    expect((await ledger(false)).summary.totalGainLoss).toBe(100);
  });

  it("keeps unattributed and ambiguous legacy bookings out of real account totals", async () => {
    transactions[0]!.bookings.push({
      ...transactions[0]!.bookings[0]!,
      id: "other",
      accountId: "ordinary",
    });
    const missing = adjustment("missing", "2026-03-02Z", "40");
    missing.bookings = missing.bookings.filter(
      (b) => b.account.type === "EQUITY",
    );
    transactions.push(missing);
    expect((await ledger()).applicable).toBe(false);
    expect(
      await queryAccountRecordedGainLossEligibility({
        accountBookId: "book",
        accountId: "portfolio",
      }),
    ).toBe(false);
  });

  it("retains active/archived recorded totals separately", async () => {
    mocks.db.account.findMany.mockImplementation(async ({ where }) =>
      where.type === "EQUITY"
        ? []
        : [
            { ...portfolio, isActive: false },
            { ...portfolio, id: "ordinary" },
          ],
    );
    expect((await list("inactive")).total.summary.totalGainLoss).toBe(100);
    expect((await list("active")).total.applicable).toBe(false);
    expect((await list("all")).total.summary.totalGainLoss).toBe(100);
  });

  it("reuses exact recorded totals from the basis cache and rejects incomplete cache payloads", async () => {
    await ledger(false);
    const reads = mocks.db.booking.findMany.mock.calls.length;
    expect((await ledger(false)).summary.totalGainLoss).toBe(100);
    expect(mocks.db.booking.findMany).toHaveBeenCalledTimes(reads);
    const payload = decodeMoneyCache<unknown>(
      JSON.parse(mocks.entries.get(basisKey)!),
    );
    expect(isAccountGainLossBasisCacheData(payload)).toBe(true);
    if (!isAccountGainLossBasisCacheData(payload))
      throw new Error("Invalid test basis");
    expect(payload.recordedGainLoss[0]?.amount?.toString()).toBe("100");
    expect(
      isAccountGainLossBasisCacheData({
        ...payload,
        recordedGainLoss: undefined,
      }),
    ).toBe(false);
    expect(
      isAccountGainLossBasisCacheData({
        ...payload,
        recordedGainLoss: [{ ...payload.recordedGainLoss[0], amount: null }],
      }),
    ).toBe(false);
    expect(
      isAccountGainLossBasisCacheData({
        ...payload,
        recordedGainLoss: [
          { ...payload.recordedGainLoss[0], accountId: "unknown" },
        ],
      }),
    ).toBe(false);
  });
});
