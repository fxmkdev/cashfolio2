const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
export const RUNTIME_CONFIGURATION_ERROR = "Unsafe E2E configuration:";

function fail(setting: string): never {
  throw new Error(`${RUNTIME_CONFIGURATION_ERROR} ${setting}`);
}

function isLoopback(host: string | undefined): boolean {
  return host !== undefined && LOOPBACK_HOSTS.has(host.replace(/^\[|\]$/g, ""));
}

/** No request headers or DNS lookups participate in the trust decision. */
export function assertSafeRuntimeConfiguration(
  e2eBuild: boolean,
  env: Readonly<Record<string, string | undefined>>,
): void {
  if (!e2eBuild) {
    for (const flag of ["E2E_TEST_MODE", "E2E_AUTH_BYPASS"]) {
      if (env[flag] === "true") fail(`${flag} requires an E2E build.`);
    }
    if (env.APP_ENVIRONMENT === "e2e")
      fail("APP_ENVIRONMENT=e2e requires an E2E build.");
    return;
  }

  if (env.APP_ENVIRONMENT !== "e2e")
    fail("APP_ENVIRONMENT must be e2e for an E2E build.");
  if (env.E2E_TEST_MODE !== "true")
    fail("E2E_TEST_MODE must be true for an E2E build.");
  // Match Nitro's host precedence, including its fallback for empty NITRO_HOST.
  if (!isLoopback(env.NITRO_HOST || env.HOST))
    fail("NITRO_HOST/HOST must explicitly bind to loopback.");

  let baseUrl: URL;
  try {
    baseUrl = new URL(env.BASE_URL ?? "");
  } catch {
    fail("BASE_URL must be an absolute loopback HTTP(S) URL.");
  }
  if (
    !["http:", "https:"].includes(baseUrl.protocol) ||
    !isLoopback(baseUrl.hostname) ||
    baseUrl.username ||
    baseUrl.password
  ) {
    fail(
      "BASE_URL must be an absolute loopback HTTP(S) URL without credentials.",
    );
  }
}
