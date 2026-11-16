import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../.prisma-client/client";
import { Temporal } from "../shared/temporal";
import {
  fetchMarketstackPage,
  fetchExchangeCountries,
  parseCatalogueRow,
  parseHistoryRows,
  type MarketstackOptions,
} from "../server/securities/marketstack.server";
import { refreshCatalogue } from "./refresh.server";

let db: PrismaClient | undefined;
const controller = new AbortController();
const cancel = () =>
  controller.abort(new Error("Catalogue refresh cancelled."));
process.once("SIGTERM", cancel);
process.once("SIGINT", cancel);
try {
  if (process.env.DATABASE_URL)
    db = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
        max: 2,
        connectionTimeoutMillis: 1000,
      }),
    });
  const options: MarketstackOptions = {
    signal: AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(30 * 60 * 1000),
    ]),
    record: async (input) => {
      if (!db) return;
      try {
        await db.$transaction(
          async (tx) => {
            await tx.$executeRawUnsafe("SET LOCAL statement_timeout = 750");
            await tx.valuationProviderRequest.create({
              data: {
                ...input,
                valuationDate: new Date(
                  `${input.requestedAt.toISOString().slice(0, 10)}T00:00:00Z`,
                ),
              },
            });
          },
          { maxWait: 500, timeout: 1000 },
        );
      } catch {
        console.warn("Could not record a catalogue provider attempt.");
      }
    },
  };
  // A small preflight validates the deployed provider contract before bulk work.
  const page = await fetchMarketstackPage(
    "tickerslist",
    { search: "AAPL", exchange: "XNAS", limit: "1", offset: "0" },
    options,
  );
  const listing = page.data
    .map(parseCatalogueRow)
    .find((row) => row.symbol === "AAPL" && row.mic === "XNAS");
  if (!listing) throw new Error("Marketstack catalogue smoke check failed.");
  const through = Temporal.Now.plainDateISO("UTC");
  const from = through.subtract({ days: 7 }).toString();
  const prices = await fetchMarketstackPage(
    "eod",
    {
      symbols: listing.symbol,
      exchange: listing.mic,
      date_from: from,
      date_to: through.toString(),
      limit: "1",
      offset: "0",
    },
    options,
  );
  const history = parseHistoryRows(
    prices.data,
    listing.symbol,
    listing.mic,
    from,
    through.toString(),
  );
  if (!history.points.length)
    throw new Error("Marketstack price smoke check failed.");
  console.log(
    "SECURITIES_SMOKE " +
      JSON.stringify({
        symbol: listing.symbol,
        mic: listing.mic,
        currency: history.currency,
        catalogueTotal: page.pagination.total,
      }),
  );
  if (!process.argv.includes("--smoke")) {
    if (!db) throw new Error("Missing catalogue database configuration.");
    const summary = await refreshCatalogue(db, {
      ...options,
      exchangeCountries: await fetchExchangeCountries(options),
    });
    console.log("SECURITIES_REFRESH " + JSON.stringify(summary));
  }
} catch {
  console.error(
    "Securities catalogue operation failed. Inspect provider usage and refresh progress; the previous catalogue remains available.",
  );
  process.exitCode = 1;
} finally {
  process.removeListener("SIGTERM", cancel);
  process.removeListener("SIGINT", cancel);
  await db?.$disconnect();
}
