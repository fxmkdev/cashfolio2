import { toDayString } from "./date-utils";

export type ProviderName = "currencylayer" | "coinlayer" | "marketstack";
type ProviderLogContextValue = string | number | boolean | null | undefined;
export type ProviderLogContext = Record<string, ProviderLogContextValue>;

function sanitizeProviderLogText(value: string): string {
  return value
    .replace(/(access_key=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(api[_-]?key=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(token=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(bearer\s+)[^\s]+/gi, "$1[redacted]");
}

function sanitizeProviderLogContext(
  context: ProviderLogContext,
): ProviderLogContext {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      typeof value === "string" ? sanitizeProviderLogText(value) : value,
    ]),
  );
}

export function toSafeProviderErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeProviderLogText(error.message);
  }
  return sanitizeProviderLogText(String(error));
}

export function logProviderInfo(
  message: string,
  context: ProviderLogContext,
): void {
  console.info(message, sanitizeProviderLogContext(context));
}

export function logProviderWarn(
  message: string,
  context: ProviderLogContext,
): void {
  console.warn(message, sanitizeProviderLogContext(context));
}

export function getProviderBaseContext(args: {
  provider: ProviderName;
  date: Date;
}): ProviderLogContext {
  return {
    provider: args.provider,
    date: toDayString(args.date),
  };
}
