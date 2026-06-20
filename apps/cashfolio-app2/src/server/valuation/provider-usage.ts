import { toUtcDay } from "./date-utils";
import { sanitizeProviderLogText } from "./provider-logging";

export const VALUATION_PROVIDER_REQUEST_REASONS = {
  INITIAL_PROBE: "INITIAL_PROBE",
  BACKTRACK_PROBE: "BACKTRACK_PROBE",
  RATE_LIMIT_RETRY: "RATE_LIMIT_RETRY",
} as const;

export type ValuationProviderRequestReason =
  (typeof VALUATION_PROVIDER_REQUEST_REASONS)[keyof typeof VALUATION_PROVIDER_REQUEST_REASONS];

export type ValuationProviderName =
  | "CURRENCYLAYER"
  | "COINLAYER"
  | "MARKETSTACK";

export type ValuationProviderUnitType =
  | "CURRENCY"
  | "CRYPTOCURRENCY"
  | "SECURITY";

export type ValuationProviderRequestOutcome =
  | "RETRIEVED"
  | "NO_DATA"
  | "MISSING_RATE"
  | "TIMEOUT"
  | "HTTP_ERROR"
  | "PROVIDER_ERROR"
  | "REQUEST_ERROR"
  | "RATE_LIMIT_RETRY";

export type RecordValuationProviderRequestInput = {
  provider: ValuationProviderName;
  unitType: ValuationProviderUnitType;
  outcome: ValuationProviderRequestOutcome;
  requestReason: ValuationProviderRequestReason;
  valuationDate: Date;
  requestedAt: Date;
  durationMs: number;
  retryCount?: number;
  currency?: string;
  cryptocurrency?: string;
  symbol?: string;
  tradeCurrency?: string;
  httpStatus?: number;
  errorMessage?: string;
};

let hasWarnedValuationProviderUsageWriteFailure = false;

function normalizeOptionalCode(value: string | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized ? normalized : undefined;
}

export async function recordValuationProviderRequest(
  input: RecordValuationProviderRequestInput,
): Promise<void> {
  try {
    const { prisma } = await import("../../prisma.server");

    await prisma.valuationProviderRequest.create({
      data: {
        provider: input.provider,
        unitType: input.unitType,
        outcome: input.outcome,
        requestReason: input.requestReason,
        requestedAt: input.requestedAt,
        valuationDate: toUtcDay(input.valuationDate),
        currency: normalizeOptionalCode(input.currency),
        cryptocurrency: normalizeOptionalCode(input.cryptocurrency),
        symbol: normalizeOptionalCode(input.symbol),
        tradeCurrency: normalizeOptionalCode(input.tradeCurrency),
        httpStatus: input.httpStatus,
        durationMs: Math.max(0, Math.round(input.durationMs)),
        retryCount: input.retryCount ?? 0,
        errorMessage: input.errorMessage
          ? sanitizeProviderLogText(input.errorMessage)
          : undefined,
      },
    });
  } catch (error) {
    if (!hasWarnedValuationProviderUsageWriteFailure) {
      console.warn(
        "Failed to record valuation provider usage; continuing without usage row.",
        error,
      );
      hasWarnedValuationProviderUsageWriteFailure = true;
    }
  }
}
