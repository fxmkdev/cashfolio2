import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";

const fetch = createStartHandler(defaultStreamHandler);
let e2eProviderMocksReadyPromise: Promise<void> | null = null;

async function ensureE2EValuationProviderMocksEnabled() {
  if (process.env.E2E_TEST_MODE !== "true") {
    return;
  }

  e2eProviderMocksReadyPromise ??=
    import("./server/valuation/e2e-provider-mocks.server").then((module) => {
      module.ensureE2EValuationProviderMocksEnabled();
    });

  await e2eProviderMocksReadyPromise;
}

function createServerEntry(entry: { fetch: typeof fetch }) {
  return {
    async fetch(...args: Parameters<typeof fetch>) {
      await ensureE2EValuationProviderMocksEnabled();
      return await entry.fetch(...args);
    },
  };
}

export default createServerEntry({ fetch });
