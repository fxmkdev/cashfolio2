import {
  ValuationProviderRequestReason,
  type ValuationProviderName,
  type ValuationProviderRequestOutcome,
  type ValuationProviderUnitType,
} from "../../.prisma-client/enums";
import { toUtcDay } from "./date-utils";
import { sanitizeProviderLogText } from "./provider-logging";

export const VALUATION_PROVIDER_REQUEST_REASONS =
  ValuationProviderRequestReason;

export type {
  ValuationProviderName,
  ValuationProviderRequestOutcome,
  ValuationProviderRequestReason,
  ValuationProviderUnitType,
};

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
export const PROVIDER_USAGE_WRITE_DEADLINE_MS = 1_000;

function normalizeOptionalCode(value: string | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized ? normalized : undefined;
}

export async function recordValuationProviderRequest(
  input: RecordValuationProviderRequestInput,
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const write = async () => {
      const { writeProviderUsage } = await import("./provider-usage-db.server");
      await writeProviderUsage({
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
          ? sanitizeProviderLogText(input.errorMessage).slice(0, 2_000)
          : undefined,
      });
    };
    await Promise.race([
      write(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Usage write deadline exceeded")),
          PROVIDER_USAGE_WRITE_DEADLINE_MS,
        );
      }),
    ]);
  } catch {
    if (!hasWarnedValuationProviderUsageWriteFailure) {
      console.warn(
        "Failed to record valuation provider usage; continuing without usage row.",
      );
      hasWarnedValuationProviderUsageWriteFailure = true;
    }
  } finally {
    clearTimeout(timeout);
  }
}
