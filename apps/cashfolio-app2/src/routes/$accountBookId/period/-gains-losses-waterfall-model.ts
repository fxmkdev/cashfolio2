import type { GainsLossesBreakdownNode } from "./-gains-losses-breakdown-types";
import { isGainsLossesNodeDrillable } from "./-gains-losses-drill";

export type GainsLossesWaterfallDatum = {
  id: string;
  label: string;
  realizedGainLoss: number;
  unrealizedGainLoss: number;
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
  totalRealizedGainLoss: number;
  totalUnrealizedGainLoss: number;
  totalGainLoss: number;
  totalAxisLabel: string;
};

const DEFAULT_TOTAL_AXIS_LABEL = "Total";

export function buildGainsLossesWaterfallModel(args: {
  nodes: GainsLossesBreakdownNode[];
  totalAxisLabel?: string;
}): GainsLossesWaterfallModel {
  const totalAxisLabel = args.totalAxisLabel ?? DEFAULT_TOTAL_AXIS_LABEL;
  const data = args.nodes.map((node) => ({
    id: node.id,
    label: node.label,
    realizedGainLoss: node.realizedGainLoss,
    unrealizedGainLoss: node.unrealizedGainLoss,
    totalGainLoss: node.totalGainLoss,
    isDrillable: isGainsLossesNodeDrillable(node),
  }));
  const totalRealizedGainLoss = data.reduce(
    (sum, datum) => sum + datum.realizedGainLoss,
    0,
  );
  const totalUnrealizedGainLoss = data.reduce(
    (sum, datum) => sum + datum.unrealizedGainLoss,
    0,
  );
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
    totalRealizedGainLoss,
    totalUnrealizedGainLoss,
    totalGainLoss,
    totalAxisLabel,
  };
}
