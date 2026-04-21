import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const thisFilePath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(thisFilePath), "..");
const baselinePath = path.join(appRoot, "coverage-baseline.json");
const coverageSummaryPath = path.join(
  appRoot,
  "coverage",
  "coverage-summary.json",
);

const METRICS = ["statements", "branches", "functions", "lines"];

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function getMetricPct(source, metric, sourceName) {
  const pct = source?.[metric]?.pct;

  if (typeof pct !== "number" || Number.isNaN(pct)) {
    throw new Error(`Missing numeric ${metric}.pct in ${sourceName}`);
  }

  return Number(pct.toFixed(2));
}

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
      { pct: getMetricPct(coverageSummary.total, metric, "coverage-summary") },
    ]),
  ),
};

writeFileSync(`${baselinePath}`, `${JSON.stringify(nextBaseline, null, 2)}\n`);

console.log("Updated coverage-baseline.json from coverage summary:");
for (const metric of METRICS) {
  console.log(`- ${metric}: ${nextBaseline.metrics[metric].pct.toFixed(2)}%`);
}
