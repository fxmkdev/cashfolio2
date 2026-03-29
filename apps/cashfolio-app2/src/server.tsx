import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import { ensureE2EValuationProviderMocksEnabled } from "./server/valuation/e2e-provider-mocks.server";

const fetch = createStartHandler(defaultStreamHandler);

function createServerEntry(entry: { fetch: typeof fetch }) {
  return {
    async fetch(...args: Parameters<typeof fetch>) {
      ensureE2EValuationProviderMocksEnabled();
      return await entry.fetch(...args);
    },
  };
}

export default createServerEntry({ fetch });
