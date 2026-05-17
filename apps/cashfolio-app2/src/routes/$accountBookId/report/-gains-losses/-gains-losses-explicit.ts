import type { GainsLossesBreakdownNode } from "./-gains-losses-breakdown-types";

const EXPLICIT_GAIN_LOSS_GROUP_ID = "unit-type:explicit";

export function hasExplicitGainLossGroup(
  hierarchy: GainsLossesBreakdownNode[],
): boolean {
  return hierarchy.some((node) => node.id === EXPLICIT_GAIN_LOSS_GROUP_ID);
}
