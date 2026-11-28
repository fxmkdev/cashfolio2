import { afterAll, beforeAll, expect, it, vi } from "vitest";
import {
  bookId,
  createMutationDatabase,
  db,
  disposeMutationDatabase,
  resetMutationDatabase,
} from "../../account-book-mutation.test-support";
import {
  largeReturnDescription,
  LARGE_RETURN_TRANSACTION_COUNT,
} from "./return-large-book.test-support";
vi.mock("../../../redis.server", () => ({ getRedisClient: async () => null }));

beforeAll(async () => {
  await createMutationDatabase();
  await resetMutationDatabase();
});
afterAll(disposeMutationDatabase);
it("reads and chunks 100,000 database transactions within the existing snapshot transaction budget", async () => {
  // The shared harness installs the disposable DATABASE_URL before runtime imports.
  const { loadAccountReturnInputs } = await import("./return-inputs.server");
  const { returnArtifacts } = await import("./return-artifacts.server");
  await db.account.createMany({
    data: [
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `holding-${i}`,
        name: `Holding ${i}`,
        accountBookId: bookId,
        type: "BALANCE" as const,
        unit: "CURRENCY" as const,
        currency: "USD",
        groupId: "A",
      })),
      {
        id: "funding",
        name: "Funding",
        accountBookId: bookId,
        type: "EQUITY",
        equityAccountSubtype: "INCOME",
        unit: "CURRENCY",
        currency: "CHF",
      },
    ],
  });
  await db.$executeRaw`
    INSERT INTO "Transaction" (id, description, "accountBookId", "createdAt", "updatedAt")
    SELECT 'transaction-' || lpad(i::text, 6, '0'), ${largeReturnDescription}, ${bookId}, now(), now()
    FROM generate_series(0, ${LARGE_RETURN_TRANSACTION_COUNT - 1}) AS series(i)
  `;
  await db.$executeRaw`
    INSERT INTO "Booking" (id, date, description, "transactionId", "accountId", unit, currency, value, "accountBookId")
    SELECT 'booking-' || i || '-' || peer,
      '2026-01-01'::timestamptz, ${largeReturnDescription},
      'transaction-' || lpad(i::text, 6, '0'),
      CASE WHEN peer = 0 THEN 'holding-' || (i % 8) ELSE 'funding' END,
      'CURRENCY'::"Unit", CASE WHEN peer = 0 THEN 'USD' ELSE 'CHF' END,
      CASE WHEN peer = 0 THEN 1 ELSE -1 END, ${bookId}
    FROM generate_series(0, ${LARGE_RETURN_TRANSACTION_COUNT - 1}) AS series(i)
    CROSS JOIN generate_series(0, 1) AS peers(peer)
  `;
  const inputs = await loadAccountReturnInputs(bookId, new Date("2026-11-07Z"));
  expect(inputs.transactions).toHaveLength(LARGE_RETURN_TRANSACTION_COUNT);
  expect(inputs.transactions.every((tx) => tx.bookings.length === 2)).toBe(
    true,
  );
  expect(inputs.transactions.at(-1)?.bookings[0]?.transactionId).toBe(
    "transaction-099999",
  );
  const artifacts = await returnArtifacts(bookId);
  await expect(
    artifacts.save(
      "large-basis",
      { ...inputs, initialBalances: [...inputs.initialBalances] },
      Date.now() + 900_000,
    ),
  ).resolves.toBeUndefined();
}, 120_000);
