export type AccountBookUnitUsage = {
  currencies: string[];
  cryptocurrencies: string[];
};

type UnitUsageAccount = {
  isActive: boolean;
  currency?: string | null;
  cryptocurrency?: string | null;
  tradeCurrency?: string | null;
};

function normalizeUnitCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized ? normalized : null;
}

function addNormalized(values: Set<string>, value: string | null | undefined) {
  const normalized = normalizeUnitCode(value);
  if (normalized) {
    values.add(normalized);
  }
}

function toSortedValues(values: Set<string>, preferredFirst?: string | null) {
  const preferred = normalizeUnitCode(preferredFirst);
  const sorted = [...values].toSorted((left, right) =>
    left.localeCompare(right),
  );

  if (!preferred || !values.has(preferred)) {
    return sorted;
  }

  return [preferred, ...sorted.filter((value) => value !== preferred)];
}

export function createAccountBookUnitUsage(args: {
  referenceCurrency: string | null | undefined;
  accounts: UnitUsageAccount[];
}): AccountBookUnitUsage {
  const currencies = new Set<string>();
  const cryptocurrencies = new Set<string>();

  addNormalized(currencies, args.referenceCurrency);

  for (const account of args.accounts) {
    if (!account.isActive) continue;

    addNormalized(currencies, account.currency);
    addNormalized(currencies, account.tradeCurrency);
    addNormalized(cryptocurrencies, account.cryptocurrency);
  }

  return {
    currencies: toSortedValues(currencies, args.referenceCurrency),
    cryptocurrencies: toSortedValues(cryptocurrencies),
  };
}
