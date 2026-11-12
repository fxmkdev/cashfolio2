import type { SecurityListing } from "./types";

export function getExchangeLabel({
  exchange,
  mic,
}: Pick<SecurityListing, "exchange" | "mic">): string {
  if (mic) return `${exchange ?? "Unknown Exchange"} (${mic})`;
  return exchange ?? "Unknown";
}
