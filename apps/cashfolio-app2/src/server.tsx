import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import {
  installGlobalServerErrorLogging,
  logServerError,
  shouldLogServerRequestError,
} from "./server/error-logging.server";

installGlobalServerErrorLogging();

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
      const request = getRequestFromFetchArgs(args);
      try {
        await ensureE2EValuationProviderMocksEnabled();
        return await entry.fetch(...args);
      } catch (error) {
        if (shouldLogServerRequestError(error)) {
          await logServerError("Server request failed.", error, {
            requestMethod: request?.method ?? "<unknown>",
            requestUrl: request?.url ?? "<unknown>",
          });
        }
        throw error;
      }
    },
  };
}

function getRequestFromFetchArgs(args: Parameters<typeof fetch>) {
  const [request] = args;
  return request instanceof Request ? request : null;
}

export default createServerEntry({ fetch });
