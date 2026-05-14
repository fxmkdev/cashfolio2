import { cryptocurrencies } from "@/cryptocurrencies";
import { currencies } from "@/currencies";
import type { AccountBookUnitUsage } from "@/shared/account-book-unit-usage";

export type UnitSelectOption = {
  value: string;
  label: string;
};

export type UnitSelectGroup = {
  group: "Used" | "Others";
  items: UnitSelectOption[];
};

export type UnitSelectData = UnitSelectGroup[];

type LabelFormatter = (code: string, name: string | undefined) => string;

type BuildGroupedUnitSelectDataArgs = {
  availableUnits: Record<string, string>;
  usedValues?: readonly (string | null | undefined)[];
  selectedValues?: readonly (string | null | undefined)[];
  formatLabel?: LabelFormatter;
};

function normalizeUnitCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized ? normalized : null;
}

function normalizeValues(
  values: readonly (string | null | undefined)[] | undefined,
): string[] {
  const normalizedValues: string[] = [];
  const seen = new Set<string>();

  for (const value of values ?? []) {
    const normalized = normalizeUnitCode(value);
    if (!normalized || seen.has(normalized)) continue;

    normalizedValues.push(normalized);
    seen.add(normalized);
  }

  return normalizedValues;
}

function formatFullLabel(code: string, name: string | undefined): string {
  return name ? `${code} – ${name}` : code;
}

function formatCodeLabel(code: string): string {
  return code;
}

function toOption(
  code: string,
  availableUnits: Record<string, string>,
  formatLabel: LabelFormatter,
): UnitSelectOption {
  return {
    value: code,
    label: formatLabel(code, availableUnits[code]),
  };
}

function buildGroupedUnitSelectData({
  availableUnits,
  usedValues,
  selectedValues,
  formatLabel = formatFullLabel,
}: BuildGroupedUnitSelectDataArgs): UnitSelectData {
  const usedCodes = normalizeValues(usedValues);
  const selectedCodes = normalizeValues(selectedValues);
  const usedCodeSet = new Set(usedCodes);
  const availableCodes = Object.keys(availableUnits).toSorted((left, right) =>
    left.localeCompare(right),
  );
  const availableCodeSet = new Set(availableCodes);
  const extraSelectedCodes = selectedCodes.filter(
    (code) => !usedCodeSet.has(code) && !availableCodeSet.has(code),
  );

  const usedItems = usedCodes.map((code) =>
    toOption(code, availableUnits, formatLabel),
  );
  const otherItems = [
    ...extraSelectedCodes,
    ...availableCodes.filter((code) => !usedCodeSet.has(code)),
  ].map((code) => toOption(code, availableUnits, formatLabel));
  const groups: UnitSelectData = [];

  if (usedItems.length > 0) {
    groups.push({ group: "Used", items: usedItems });
  }
  if (otherItems.length > 0) {
    groups.push({ group: "Others", items: otherItems });
  }

  return groups;
}

export function buildCurrencySelectData(args?: {
  unitUsage?: AccountBookUnitUsage;
  usedCurrencies?: readonly (string | null | undefined)[];
  selectedCurrencies?: readonly (string | null | undefined)[];
  compactLabels?: boolean;
}): UnitSelectData {
  return buildGroupedUnitSelectData({
    availableUnits: currencies,
    usedValues: args?.usedCurrencies ?? args?.unitUsage?.currencies,
    selectedValues: args?.selectedCurrencies,
    formatLabel:
      args?.compactLabels === false ? formatFullLabel : formatCodeLabel,
  });
}

export function buildCryptocurrencySelectData(args?: {
  unitUsage?: AccountBookUnitUsage;
  usedCryptocurrencies?: readonly (string | null | undefined)[];
  selectedCryptocurrencies?: readonly (string | null | undefined)[];
  compactLabels?: boolean;
}): UnitSelectData {
  return buildGroupedUnitSelectData({
    availableUnits: cryptocurrencies,
    usedValues: args?.usedCryptocurrencies ?? args?.unitUsage?.cryptocurrencies,
    selectedValues: args?.selectedCryptocurrencies,
    formatLabel: args?.compactLabels ? formatCodeLabel : formatFullLabel,
  });
}
