import type { PeriodGainLossReconciliation } from "@/server/period-gain-loss-reconciliation";

export type RealizedEventRow =
  PeriodGainLossReconciliation["realizedEvents"][number];
export type RealizedEventLotMatchRow = RealizedEventRow["lotMatches"][number];
export type OpenLotRow =
  PeriodGainLossReconciliation["unrealizedOpenLots"][number];
export type DiagnosticRow =
  PeriodGainLossReconciliation["diagnostics"]["items"][number];

export type EventSide = "buy" | "sell" | "flat";
