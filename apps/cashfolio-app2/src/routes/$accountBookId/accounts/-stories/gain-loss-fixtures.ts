import type { AccountGainLossSummaries } from "@/shared/account-gain-loss";
import type { TreeRow } from "../-page-types";
import type { AccountsStoryOptions } from "./types";
export function getStoryGainLossData(
  rows: TreeRow[],
  gainLossState: AccountsStoryOptions["gainLossState"],
): AccountGainLossSummaries {
  return {
    referenceCurrency: "CHF",
    startDate: "2026-01-01Z",
    asOfDate: "2026-03-31Z",
    rows: rows.map((row) => ({
      id: row.id,
      applicable: row.id === "account-holding" || row.id === "group-assets",
      summary:
        row.id === "account-holding" || row.id === "group-assets"
          ? {
              realizedGainLoss: 20,
              unrealizedGainLoss: gainLossState === "partial" ? null : -10,
              totalGainLoss: gainLossState === "partial" ? null : 10,
            }
          : {
              realizedGainLoss: null,
              unrealizedGainLoss: null,
              totalGainLoss: null,
            },
      diagnostics:
        gainLossState === "partial"
          ? [
              {
                date: "2026-03-31Z",
                message: "Closing valuation is unavailable.",
              },
            ]
          : [],
    })),
    total: {
      applicable: true,
      summary: {
        realizedGainLoss: 20,
        unrealizedGainLoss: gainLossState === "partial" ? null : -10,
        totalGainLoss: gainLossState === "partial" ? null : 10,
      },
      diagnostics: [],
    },
  };
}
