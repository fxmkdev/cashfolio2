import { expect, test } from "vitest";
import { historyChartData } from "./history-chart-data";
test("sorts explicit omissions into gaps without manufacturing calendar observations", () => {
  expect(
    historyChartData(
      [
        { date: "2026-11-09", close: 20 },
        { date: "2026-11-05", close: 10 },
      ],
      [{ date: "2026-11-06", reason: "non-positive" }],
    ),
  ).toEqual([
    { date: "2026-11-05", close: 10 },
    { date: "2026-11-06", close: null },
    { date: "2026-11-09", close: 20 },
  ]);
});
