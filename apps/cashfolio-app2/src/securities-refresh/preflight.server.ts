import { Temporal } from "../shared/temporal";
import {
  fetchMarketstackPage,
  parseCatalogueRow,
  isCataloguePlaceholder,
  parseHistoryRows,
  type MarketstackOptions,
} from "../server/securities/marketstack.server";

/** Validate a small provider sample before any bulk catalogue retrieval. */
export async function marketstackPreflight(options: MarketstackOptions) {
  const page = await fetchMarketstackPage(
    "tickerslist",
    { search: "AAPL", exchange: "XNAS", limit: "1", offset: "0" },
    options,
  );
  const listing = page.data
    .filter((row) => !isCataloguePlaceholder(row))
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
}
