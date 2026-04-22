import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const thisFilePath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(thisFilePath), "..");

export const baselinePath = path.join(appRoot, "coverage-baseline.json");
export const coverageSummaryPath = path.join(
  appRoot,
  "coverage",
  "coverage-summary.json",
);
export const METRICS = ["statements", "branches", "functions", "lines"];

export function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function formatPct(value) {
  return `${value.toFixed(2)}%`;
}

export function getMetricPct(source, metric, sourceName) {
  const pct = source?.[metric]?.pct;
  if (typeof pct !== "number" || Number.isNaN(pct)) {
    throw new Error(`Missing numeric ${metric}.pct in ${sourceName}`);
  }
  return pct;
}
