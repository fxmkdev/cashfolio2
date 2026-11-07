/** Limits shared by browser validation and the server. Counts apply before deduplication. */
export const RESOURCE_LIMITS = {
  bodyBytes: 5 * 1024 * 1024,
  bodyReadMs: 10_000,
  transactions: 1_000,
  totalBookings: 5_000,
  bookingsPerTransaction: 100,
  bulkItems: 1_000,
  description: 4_000,
  name: 255,
  identifier: 128,
  unitCode: 64,
  historyMonths: 120,
  historyYears: 100,
  readMs: 60_000,
  providerAttempts: 250,
} as const;

export function assertLength(
  value: { length: number },
  max: number,
  label: string,
) {
  const words = label.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  const subject = words.charAt(0).toUpperCase() + words.slice(1);
  if (value.length > max)
    throw new Error(
      `${subject} cannot exceed ${max.toLocaleString("en-CH")} ${typeof value === "string" ? "characters" : "items"}.`,
    );
}

export function assertTransactionLimits(
  transactions: readonly {
    description: string;
    bookings: readonly { description: string }[];
  }[],
) {
  assertLength(transactions, RESOURCE_LIMITS.transactions, "An import");
  let bookings = 0;
  for (const transaction of transactions) {
    assertLength(
      transaction.bookings,
      RESOURCE_LIMITS.bookingsPerTransaction,
      "Transaction bookings",
    );
    bookings += transaction.bookings.length;
    if (bookings > RESOURCE_LIMITS.totalBookings)
      throw new Error(
        "An import cannot exceed 5’000 bookings. Split the statement and try again. No changes were saved.",
      );
    assertLength(
      transaction.description,
      RESOURCE_LIMITS.description,
      "Description",
    );
    for (const booking of transaction.bookings)
      assertLength(
        booking.description,
        RESOURCE_LIMITS.description,
        "Booking description",
      );
  }
}
