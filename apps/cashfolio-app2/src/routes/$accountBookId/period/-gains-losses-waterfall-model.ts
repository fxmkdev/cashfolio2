import type { GainsLossesBreakdownNode } from "./-gains-losses-breakdown-types";
import { isGainsLossesNodeDrillable } from "./-gains-losses-drill";

export type GainsLossesWaterfallDatum = {
  id: string;
  label: string;
  totalGainLoss: number;
  isDrillable: boolean;
};

export type GainsLossesWaterfallTotal = {
  totalType: "total";
  index: number;
  axisLabel: string;
};

export type GainsLossesWaterfallModel = {
  data: GainsLossesWaterfallDatum[];
  totals: GainsLossesWaterfallTotal[];
  totalGainLoss: number;
  totalAxisLabel: string;
};

const DEFAULT_TOTAL_AXIS_LABEL = "Total";

function toFiniteNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function resolveNodeTotalGainLoss(node: GainsLossesBreakdownNode): number {
  const nodeRecord = node as unknown as Record<string, unknown>;
  const rawTotalGainLoss = nodeRecord.totalGainLoss;
  if (rawTotalGainLoss !== undefined) {
    return toFiniteNumber(rawTotalGainLoss);
  }

  const rawGainLoss = nodeRecord.gainLoss;
  if (rawGainLoss !== undefined) {
    return toFiniteNumber(rawGainLoss);
  }

  const hasSplitGainLoss =
    nodeRecord.realizedGainLoss !== undefined ||
    nodeRecord.unrealizedGainLoss !== undefined;
  if (hasSplitGainLoss) {
    return (
      toFiniteNumber(nodeRecord.realizedGainLoss) +
      toFiniteNumber(nodeRecord.unrealizedGainLoss)
    );
  }

  return 0;
}

export function buildGainsLossesWaterfallModel(args: {
  nodes: GainsLossesBreakdownNode[];
  totalAxisLabel?: string;
}): GainsLossesWaterfallModel {
  const totalAxisLabel = args.totalAxisLabel ?? DEFAULT_TOTAL_AXIS_LABEL;
  const data = args.nodes.map((node) => ({
    id: node.id,
    label: node.label,
    totalGainLoss: resolveNodeTotalGainLoss(node),
    isDrillable: isGainsLossesNodeDrillable(node),
  }));
  const totalGainLoss = data.reduce(
    (sum, datum) => sum + datum.totalGainLoss,
    0,
  );

  return {
    data,
    totals:
      data.length > 0
        ? [
            {
              totalType: "total",
              index: data.length - 1,
              axisLabel: totalAxisLabel,
            },
          ]
        : [],
    totalGainLoss,
    totalAxisLabel,
  };
}
