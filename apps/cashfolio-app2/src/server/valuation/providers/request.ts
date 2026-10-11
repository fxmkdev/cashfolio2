import {
  logProviderWarn,
  toSafeProviderErrorMessage,
  type ProviderLogContext,
} from "../provider-logging";
import { type ValuationProviderRequestOutcome } from "../provider-usage";

export type RecordProviderAttempt = (args: {
  outcome: ValuationProviderRequestOutcome;
  httpStatus?: number;
  errorMessage?: string;
}) => Promise<void>;

export async function fetchProviderResponse(args: {
  url: string;
  timeoutMs: number;
  timeoutMessage: string;
  requestContext: ProviderLogContext;
  recordUsage: RecordProviderAttempt;
}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs);

  try {
    return await fetch(args.url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const timeoutError = new Error(args.timeoutMessage);
      await args.recordUsage({
        outcome: "TIMEOUT",
        errorMessage: timeoutError.message,
      });
      logProviderWarn(timeoutError.message, {
        ...args.requestContext,
        timeoutMs: args.timeoutMs,
        outcome: "timeout",
      });
      throw timeoutError;
    }
    await args.recordUsage({
      outcome: "REQUEST_ERROR",
      errorMessage: toSafeProviderErrorMessage(error),
    });
    logProviderWarn("Valuation provider request failed", {
      ...args.requestContext,
      outcome: "requestError",
      error: toSafeProviderErrorMessage(error),
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
