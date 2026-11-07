import { afterEach, describe, expect, it, vi } from "vitest";
import { toMoney } from "../shared/money";
import { ResourceLimitError } from "./resource-error";
import { encodeMoneyCache } from "./money-cache-codec";
import { cacheDate, cacheMoney, cacheObject } from "./cache-validation";
import {
  createCacheFailureReporter,
  readValidatedMoneyCache,
} from "./money-cache-read";

const validate = cacheObject<{
  date: Date;
  amount: ReturnType<typeof toMoney>;
}>({ date: cacheDate, amount: cacheMoney });
const input = {
  date: new Date("2026-01-01Z"),
  amount: toMoney("9007199254740993.123456789"),
};
afterEach(() => vi.restoreAllMocks());

describe("defensive money cache reads", () => {
  it("decodes exact money and dates at the byte limit", async () => {
    const encoded = JSON.stringify(encodeMoneyCache(input));
    expect(
      await readValidatedMoneyCache({
        read: async () => encoded,
        maxBytes: Buffer.byteLength(encoded),
        validate,
        reportFailure: vi.fn(),
      }),
    ).toEqual(input);
  });

  it("checks UTF-8 bytes before parsing or validation", async () => {
    const encoded = JSON.stringify({ text: "€".repeat(10) });
    const parse = vi.spyOn(JSON, "parse");
    const reportFailure = vi.fn();
    const check = vi.fn(validate);
    expect(
      await readValidatedMoneyCache({
        read: async () => encoded,
        maxBytes: encoded.length,
        validate: (value: unknown): value is typeof input => check(value),
        reportFailure,
      }),
    ).toBeUndefined();
    expect(parse).not.toHaveBeenCalled();
    expect(check).not.toHaveBeenCalled();
    expect(reportFailure).not.toHaveBeenCalled();
  });

  it.each([
    null,
    "",
    "{",
    "null",
    "[]",
    "{}",
    '{"date":{"__cashfolioDateMs":1e99},"amount":{"__cashfolioDecimal":"1"}}',
    '{"date":{"__cashfolioDateMs":0},"amount":{"__cashfolioDecimal":"NaN"}}',
  ])(
    "treats malformed, missing, or invalid data as a miss: %s",
    async (encoded) => {
      expect(
        await readValidatedMoneyCache({
          read: async () => encoded,
          maxBytes: 1024,
          validate,
          reportFailure: vi.fn(),
        }),
      ).toBeUndefined();
    },
  );

  it("reports Redis failures once and keeps cancellation observable", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const reportFailure = createCacheFailureReporter("Cache failed.");
    for (let i = 0; i < 2; i++) {
      expect(
        await readValidatedMoneyCache({
          read: async () => {
            throw new Error("redis offline");
          },
          maxBytes: 1024,
          validate,
          reportFailure,
        }),
      ).toBeUndefined();
    }
    expect(warning).toHaveBeenCalledTimes(1);
    const cancelled = new ResourceLimitError("Cancelled", 503, 5, "cancelled");
    await expect(
      readValidatedMoneyCache({
        read: async () => {
          throw cancelled;
        },
        maxBytes: 1024,
        validate,
        reportFailure,
      }),
    ).rejects.toBe(cancelled);
    expect(warning).toHaveBeenCalledTimes(1);
  });
});
