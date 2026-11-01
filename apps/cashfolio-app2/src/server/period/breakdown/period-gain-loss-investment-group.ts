import type {
  AccountTrackingMethod,
  Unit,
} from "../../../.prisma-client/enums";

export type GainLossInvestmentGroup = { key: string; label: string };

export const UNKNOWN_GAIN_LOSS_UNIT: GainLossInvestmentGroup = {
  key: "unknown",
  label: "Unknown Unit",
};

export function getGainLossInvestmentGroup(identity: {
  trackingMethod?: AccountTrackingMethod;
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
}): GainLossInvestmentGroup {
  if (identity.trackingMethod === "TOTAL_PORTFOLIO_VALUE") {
    return { key: "managed-portfolios", label: "Total Value Accounts" };
  }
  const code = (
    identity.unit === "CURRENCY"
      ? identity.currency
      : identity.unit === "CRYPTOCURRENCY"
        ? identity.cryptocurrency
        : identity.unit === "SECURITY"
          ? identity.symbol
          : null
  )
    ?.trim()
    .toUpperCase();
  return code
    ? { key: `${identity.unit}:${encodeURIComponent(code)}`, label: code }
    : UNKNOWN_GAIN_LOSS_UNIT;
}
