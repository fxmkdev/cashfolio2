const E2E_MOCKED_PROVIDER_API_KEY = "e2e-mocked-provider-key";
const warnedMissingProviderKeys = new Set<string>();

function getE2EMockedProviderApiKey(): string | null {
  if (process.env.E2E_TEST_MODE !== "true") {
    return null;
  }
  return E2E_MOCKED_PROVIDER_API_KEY;
}

export function getProviderApiKey(args: {
  envVarName: string;
  missingKeyWarning: string;
}): string | null {
  const configuredApiKey = process.env[args.envVarName]?.trim();
  if (configuredApiKey) {
    return configuredApiKey;
  }

  const e2eMockedApiKey = getE2EMockedProviderApiKey();
  if (e2eMockedApiKey) {
    return e2eMockedApiKey;
  }

  if (!warnedMissingProviderKeys.has(args.envVarName)) {
    console.warn(args.missingKeyWarning);
    warnedMissingProviderKeys.add(args.envVarName);
  }

  return null;
}
