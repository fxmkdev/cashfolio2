const warnedMissingProviderKeys = new Set<string>();

export async function getProviderApiKey(args: {
  envVarName: string;
  missingKeyWarning: string;
}): Promise<string | null> {
  const configuredApiKey = process.env[args.envVarName]?.trim();
  if (configuredApiKey) {
    return configuredApiKey;
  }

  if (__E2E_BUILD__) {
    const { getE2EMockedProviderApiKey } =
      await import("../../e2e/provider-api-key");
    return getE2EMockedProviderApiKey();
  }

  if (!warnedMissingProviderKeys.has(args.envVarName)) {
    console.warn(args.missingKeyWarning);
    warnedMissingProviderKeys.add(args.envVarName);
  }

  return null;
}
