export type SyncAccountBookConfig = {
  prodDatabaseReadonlyUrl: string;
  stagingDatabaseUrl: string;
  accountBookId: string;
  targetUserExternalId: string;
  allowGitHubActions: boolean;
};

export type SyncAccountBookEnv = Record<string, string | undefined> & {
  PROD_DATABASE_READONLY_URL?: string;
  STAGING_DATABASE_URL?: string;
  SYNC_ACCOUNT_BOOK_ID?: string;
  SYNC_TARGET_USER_EXTERNAL_ID?: string;
  SYNC_ACCOUNT_BOOK_ALLOW_GITHUB_ACTIONS?: string;
  GITHUB_ACTIONS?: string;
};

export type AccountGroupParentRef = {
  id: string;
  parentGroupId: string | null;
};

export type AccountWithEquitySubtype = {
  type: string;
  equityAccountSubtype: string | null;
};

const REQUIRED_ENV_VARS = [
  "PROD_DATABASE_READONLY_URL",
  "STAGING_DATABASE_URL",
  "SYNC_ACCOUNT_BOOK_ID",
  "SYNC_TARGET_USER_EXTERNAL_ID",
] as const;

export function readSyncAccountBookConfig(
  env: SyncAccountBookEnv,
): SyncAccountBookConfig {
  const missing = REQUIRED_ENV_VARS.filter((name) => !env[name]?.trim());

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  const config = {
    prodDatabaseReadonlyUrl: env.PROD_DATABASE_READONLY_URL!.trim(),
    stagingDatabaseUrl: env.STAGING_DATABASE_URL!.trim(),
    accountBookId: env.SYNC_ACCOUNT_BOOK_ID!.trim(),
    targetUserExternalId: env.SYNC_TARGET_USER_EXTERNAL_ID!.trim(),
    allowGitHubActions:
      env.SYNC_ACCOUNT_BOOK_ALLOW_GITHUB_ACTIONS?.toLowerCase() === "true",
  };

  assertValidDatabaseUrl(config.prodDatabaseReadonlyUrl, "source database");
  assertValidDatabaseUrl(config.stagingDatabaseUrl, "target database");
  assertNotGitHubActions(env, config.allowGitHubActions);

  if (config.prodDatabaseReadonlyUrl === config.stagingDatabaseUrl) {
    throw new Error("Source and target database URLs must be different.");
  }

  return config;
}

export function assertNotGitHubActions(
  env: Pick<SyncAccountBookEnv, "GITHUB_ACTIONS">,
  allowGitHubActions: boolean,
) {
  if (env.GITHUB_ACTIONS === "true" && !allowGitHubActions) {
    throw new Error(
      "Refusing to run in GitHub Actions. Set SYNC_ACCOUNT_BOOK_ALLOW_GITHUB_ACTIONS=true to override.",
    );
  }
}

export function isExpectedConfirmation(
  confirmation: string,
  accountBookId: string,
) {
  return confirmation.trim() === `replace ${accountBookId}`;
}

export function withoutAccountGroupParentIds<T extends AccountGroupParentRef>(
  groups: T[],
): T[] {
  return groups.map((group) => ({ ...group, parentGroupId: null }));
}

export function hasGainLossAccount(accounts: AccountWithEquitySubtype[]) {
  return accounts.some(
    (account) =>
      account.type === "EQUITY" && account.equityAccountSubtype === "GAIN_LOSS",
  );
}

function assertValidDatabaseUrl(value: string, label: string) {
  try {
    const parsed = new URL(value);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw new Error(`Invalid ${label} URL.`);
  }
}
