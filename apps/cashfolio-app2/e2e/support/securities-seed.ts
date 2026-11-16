import { assertSafeWriteTarget, prisma } from "./db-client";
/** Shared, deterministic catalogue for the mocked Securities E2E flow. */
export async function seedSecuritiesCatalogue() {
  assertSafeWriteTarget();
  const id = "e2e-securities-catalogue";
  await prisma.securityCatalogueSnapshot.upsert({
    where: { id },
    update: {},
    create: {
      id,
      publishedAt: new Date(),
      rowCount: 3,
      listings: {
        create: [
          {
            id: "e2e-security-xnas",
            symbol: "E2E.SEC",
            name: "E2E Example Security",
            exchange: "NASDAQ",
            mic: "XNAS",
            exchangeLabel: "NASDAQ (XNAS)",
            country: "US",
            hasHistory: true,
          },
          {
            id: "e2e-security-xswx",
            symbol: "E2E.SEC",
            name: "E2E Example Security",
            exchange: "SIX Swiss Exchange",
            mic: "XSWX",
            exchangeLabel: "SIX Swiss Exchange (XSWX)",
            country: "CH",
            hasHistory: null,
          },
          {
            id: "e2e-security-no-history",
            symbol: "E2E.OLD",
            name: "E2E Unavailable Security",
            exchange: null,
            mic: "",
            exchangeLabel: "Unknown",
            hasHistory: false,
          },
        ],
      },
    },
  });
}
