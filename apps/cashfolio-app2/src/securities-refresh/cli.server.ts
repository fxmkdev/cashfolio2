import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../.prisma-client/client";
import {
  fetchExchangeCountries,
  type MarketstackOptions,
} from "../server/securities/marketstack.server";
import { marketstackPreflight } from "./preflight.server";
import { readRefreshArguments } from "./options";
import { refreshCatalogue } from "./refresh.server";

let db: PrismaClient | undefined;
const controller = new AbortController();
const cancel = () =>
  controller.abort(new Error("Catalogue refresh cancelled."));
process.once("SIGTERM", cancel);
process.once("SIGINT", cancel);
try {
  const args = readRefreshArguments(process.argv.slice(2));
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
  if (args.smoke) {
    await marketstackPreflight(options);
  } else {
    if (!db) throw new Error("Missing catalogue database configuration.");
    const summary = await refreshCatalogue(db, {
      ...options,
      onlyIfMissing: args.onlyIfMissing,
      prepare: async (signal) => {
        const providerOptions = { ...options, signal };
        await marketstackPreflight(providerOptions);
        return fetchExchangeCountries(providerOptions);
      },
    });
    console.log("SECURITIES_REFRESH " + JSON.stringify(summary));
  }
} catch {
  console.error(
    "Securities catalogue operation failed. Inspect provider usage and refresh progress, then retry. No incomplete catalogue was published.",
  );
  process.exitCode = 1;
} finally {
  process.removeListener("SIGTERM", cancel);
  process.removeListener("SIGINT", cancel);
  await db?.$disconnect();
}
