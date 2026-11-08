import type { Unit } from "../../../.prisma-client/enums";
import type { HoldingGainLossSkippedReason } from "../../../shared/gain-loss-reconciliation";
import type { Money } from "../../../shared/money";
import type {
  HoldingExecutionLotMatch,
  HoldingLot,
} from "../../holdings/types";
import type {
  TransferClearingBooking,
  TransferClearingUnitBucket,
} from "./period-transfer-clearing-types";
type TransferClearingGainLossSkippedReason = HoldingGainLossSkippedReason;
export type TransferClearingGainLossArgs = {
  unitBuckets: TransferClearingUnitBucket[];
  periodStart: Date;
  periodEndExclusive: Date;
  initialRateDate: Date;
  periodEnd: Date;
  resolveRate: (input: {
    unit: Unit;
    currency: string | null;
    cryptocurrency: string | null;
    symbol: string | null;
    tradeCurrency: string | null;
    date: Date;
  }) => Promise<Money | null>;
  convertBookingToReference: (
    booking: TransferClearingBooking,
  ) => Promise<Money | null>;
  onUnitGainLoss?: (gainLossByUnit: {
    unitKey: TransferClearingUnitBucket["unitKey"];
    unitLabel: TransferClearingUnitBucket["unitLabel"];
    unit: TransferClearingUnitBucket["unit"];
    currency: TransferClearingUnitBucket["currency"];
    cryptocurrency: TransferClearingUnitBucket["cryptocurrency"];
    symbol: TransferClearingUnitBucket["symbol"];
    tradeCurrency: TransferClearingUnitBucket["tradeCurrency"];
    realizedGainLoss: Money;
    unrealizedGainLoss: Money;
  }) => void;
  onUnitExecutionEvent?: (event: {
    unitKey: TransferClearingUnitBucket["unitKey"];
    bookingId: string;
    bookingDescription?: string | null;
    transactionDescription?: string | null;
    transactionId: string | null;
    date: Date;
    quantity: Money;
    pricingSource: "directConversion";
    marketReferenceAmount: Money;
    residualAllocationAmount: Money;
    effectiveReferenceAmount: Money;
    executionUnitPriceInReference: Money;
    realizedGainLossDelta: Money;
    runningRealizedGainLoss: Money;
    lotMatches: HoldingExecutionLotMatch[];
  }) => void;
  onUnitOpenLotValuation?: (lot: {
    unitKey: TransferClearingUnitBucket["unitKey"];
    acquisitionSortKey: string;
    quantity: Money;
    unitCostInReference: Money;
    periodEndRate: Money;
    unrealizedGainLoss: Money;
  }) => void;
  onSkippedItem?: (item: {
    unitKey: TransferClearingUnitBucket["unitKey"];
    bookingId?: string;
    bookingDescription?: string | null;
    transactionDescription?: string | null;
    transactionId?: string | null;
    reason: TransferClearingGainLossSkippedReason;
    date: Date;
  }) => void;
};

export type TransferClearingTotals = {
  realizedGainLoss: Money;
  unrealizedGainLoss: Money;
  convertedCount: number;
  skippedCount: number;
};

export type TransferClearingUnitState = {
  lots: HoldingLot[];
  realizedGainLoss: Money;
  unrealizedGainLoss: Money;
};
