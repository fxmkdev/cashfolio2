import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Temporal } from "../../shared/temporal";
import { readCachedHistory } from "./history-cache.server";
const sample = {
  status: "ready",
  points: [{ date: "2026-11-10", close: 15 }],
  omissions: [{ date: "2026-11-11", reason: "missing" }],
  currency: "USD",
  securityType: "Stock",
};
const parse = (value: unknown) =>
  readCachedHistory(
    JSON.stringify(value),
    "ABC",
    "XNAS",
    "2021-11-16",
    "2026-11-16",
  );
beforeEach(() =>
  vi
    .spyOn(Temporal.Now, "instant")
    .mockReturnValue(Temporal.Instant.from("2026-11-16T10:00:00Z")),
);
afterEach(() => vi.restoreAllMocks());
test("validates positive observations and explicit gaps", () =>
  expect(parse(sample)).toEqual(sample));
test.each([
  null,
  {},
  { ...sample, status: "unsupported" },
  { ...sample, currency: {} },
  { ...sample, securityType: "" },
  { ...sample, points: [{ date: "2026-11-10", close: 0 }] },
  { ...sample, points: [{ date: "2026-11-10", close: "15" }] },
  { ...sample, points: [{ date: "2026-02-30", close: 15 }] },
  { ...sample, omissions: [{ date: "2026-11-10", reason: "missing" }] },
  { ...sample, omissions: [{ date: "2026-11-11", reason: "wrong" }] },
  { ...sample, omissions: [{ date: "2026-11-17", reason: "invalid" }] },
  { ...sample, points: [] },
])("rejects corrupt cache values: %j", (value) =>
  expect(() => parse(value)).toThrow(),
);
test("negative cache reconstructs safe messages and rejects invalid expiry/status combinations", () => {
  const unavailable = {
    status: "unavailable",
    reason: "no-data",
    points: [],
    omissions: [],
    currency: null,
    securityType: null,
    retryAt: "2026-11-16T10:05:00Z",
    message: "arbitrary unsafe content",
  };
  expect(parse(unavailable)).toMatchObject({
    message: "Marketstack returned no price history for this listing.",
  });
  for (const change of [
    { retryAt: "2026-11-16T09:00:00Z" },
    { retryAt: "2030-01-01T00:00:00Z" },
    { retryAt: "broken" },
    { reason: "no-usable-prices" },
    { reason: "other" },
    { points: sample.points },
    { omissions: sample.omissions },
  ])
    expect(() => parse({ ...unavailable, ...change })).toThrow();
});
