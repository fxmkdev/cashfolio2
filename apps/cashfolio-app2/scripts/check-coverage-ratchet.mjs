import { readFileSync } from "node:fs";
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
const ROUNDING_TOLERANCE = 0.01;

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function formatPct(value) {
  return `${value.toFixed(2)}%`;
}

function getMetricPct(source, metric, sourceName) {
  const pct = source?.[metric]?.pct;
  if (typeof pct !== "number" || Number.isNaN(pct)) {
    throw new Error(`Missing numeric ${metric}.pct in ${sourceName}`);
  }
  return pct;
}

const baseline = readJson(baselinePath);
const coverageSummary = readJson(coverageSummaryPath);

const baselineTotal = baseline.metrics;
const currentTotal = coverageSummary.total;

if (!baselineTotal || typeof baselineTotal !== "object") {
  throw new Error(
    "coverage-baseline.json must define a top-level metrics object",
  );
}
if (!currentTotal || typeof currentTotal !== "object") {
  throw new Error(
    "coverage/coverage-summary.json must define a top-level total object",
  );
}

let hasRegression = false;
const lines = [];

for (const metric of METRICS) {
  const baselinePct = getMetricPct(
    baselineTotal,
    metric,
    "coverage-baseline.json",
  );
  const currentPct = getMetricPct(
    currentTotal,
    metric,
    "coverage-summary.json",
  );
  const delta = currentPct - baselinePct;
  const regressed = currentPct + ROUNDING_TOLERANCE < baselinePct;

  if (regressed) {
    hasRegression = true;
  }

  const direction = delta > 0 ? "+" : "";
  const status = regressed ? "REGRESSED" : "OK";
  lines.push(
    `${metric.padEnd(11)} baseline=${formatPct(baselinePct)} current=${formatPct(currentPct)} delta=${direction}${delta.toFixed(2)}pp ${status}`,
  );
}

console.log("Coverage ratchet check");
console.log(lines.join("\n"));

if (hasRegression) {
  console.error(
    "Coverage regressed below baseline. Update tests or explicitly raise baseline in a dedicated follow-up change.",
  );
  process.exit(1);
}
