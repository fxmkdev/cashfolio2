import type { StatementImportDraft } from "./-statement-import-types";

// Serialize only user-controlled values, in a fixed order. The string remains
// immutable even if a grid editor mutates its row data.
export function getStatementImportReviewSnapshot(
  drafts: StatementImportDraft[],
): string {
  return JSON.stringify(
    drafts.map(({ ignored, transaction }) => ({
      ignored,
      description: transaction.description,
      bookings: transaction.bookings.map((booking) => ({
        date: booking.date,
        accountId: booking.accountId,
        description: booking.description,
        unit: booking.unit,
        currency: booking.currency ?? null,
        cryptocurrency: booking.cryptocurrency ?? null,
        symbol: booking.symbol ?? null,
        tradeCurrency: booking.tradeCurrency ?? null,
        value: booking.value,
      })),
    })),
  );
}
