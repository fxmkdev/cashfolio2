import { writeFileSync } from "node:fs";
import {
  baselinePath,
  coverageSummaryPath,
  getMetricPct,
  METRICS,
  readJson,
} from "./coverage-ratchet-utils.mjs";

const coverageSummary = readJson(coverageSummaryPath);

if (!coverageSummary.total || typeof coverageSummary.total !== "object") {
  throw new Error(
    "coverage/coverage-summary.json must define a top-level total object",
  );
}

const nextBaseline = {
  metrics: Object.fromEntries(
    METRICS.map((metric) => [
      metric,
      {
        pct: Number(
          getMetricPct(
            coverageSummary.total,
            metric,
            "coverage-summary.json",
          ).toFixed(2),
        ),
      },
    ]),
  ),
};

writeFileSync(`${baselinePath}`, `${JSON.stringify(nextBaseline, null, 2)}\n`);

console.log("Updated coverage-baseline.json from coverage summary:");
for (const metric of METRICS) {
  console.log(`- ${metric}: ${nextBaseline.metrics[metric].pct.toFixed(2)}%`);
}
