import { describe, expect, test } from "vitest";
import {
  HistoryDataError,
  historyOmissionDiagnostics,
  parseHistoryRows,
} from "./history-data.server";
const price = {
  symbol: "VWCE.DE",
  exchange: "XETR",
  date: "2026-11-01",
  close: 100,
  price_currency: "EUR",
  asset_type: "ETF",
};
const parse = (rows: unknown[]) =>
  parseHistoryRows(rows, "VWCE.DE", "XETR", "2026-11-01", "2026-11-18");
describe("history observation quality", () => {
  test("keeps actual prices and records dated omissions without numeric coercion", () => {
    const values = [
      100,
      null,
      undefined,
      0,
      -1,
      NaN,
      Infinity,
      "123.45",
      true,
      {},
      110,
    ];
    const rows = values.map((close, i) => ({
      ...price,
      date: `2026-11-${String(i + 1).padStart(2, "0")}`,
      close,
    }));
    const result = parse(rows.reverse());
    expect(result.points).toEqual([
      { date: "2026-11-01", close: 100 },
      { date: "2026-11-11", close: 110 },
    ]);
    expect(result.omissions.map((o) => o.reason)).toEqual([
      "missing",
      "missing",
      "non-positive",
      "non-positive",
      "invalid",
      "invalid",
      "invalid",
      "invalid",
      "invalid",
    ]);
    expect(result).toMatchObject({ currency: "EUR", securityType: "ETF" });
  });
  test("retains metadata even when no prices are usable", () => {
    expect(parse([{ ...price, close: 0 }])).toEqual({
      points: [],
      omissions: [{ date: price.date, reason: "non-positive" }],
      currency: "EUR",
      securityType: "ETF",
    });
  });
  test.each([
    [{ ...price, close: null }, price],
    [{ ...price, close: 0, exchange: "XNAS" }],
    [{ ...price, close: 0, symbol: "OTHER" }],
    [{ ...price, close: 0, date: "2026-02-30" }],
    [{ ...price, close: null, date: "2026-10-30" }],
    [price, { ...price, date: "2026-11-02", close: 0, price_currency: "USD" }],
    [{ ...price, close: null, price_currency: {} }],
  ])("rejects unsafe metadata even on omitted observations: %j", (...rows) => {
    expect(() => parse(rows)).toThrow(HistoryDataError);
  });
  test("bounds diagnostics and never logs arbitrary values", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      ...price,
      date: `2026-11-${String(i + 1).padStart(2, "0")}`,
      close: i ? "https://private.example/?access_key=secret" : -1,
    }));
    rows[0]!.date = " 2026-11-01 ";
    const diagnostics = historyOmissionDiagnostics(rows, parse(rows));
    expect(diagnostics.counts).toEqual({
      missing: 0,
      "non-positive": 1,
      invalid: 11,
    });
    expect(diagnostics.samples).toHaveLength(5);
    expect(diagnostics.samples[0]).toMatchObject({ numericValue: -1 });
    expect(JSON.stringify(diagnostics)).not.toMatch(/secret|private.example/);
  });
});
