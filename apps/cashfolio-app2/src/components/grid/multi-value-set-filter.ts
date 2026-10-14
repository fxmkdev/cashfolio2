import type { ColDef, ValueFormatterParams } from "ag-grid-enterprise";

type MultiValueSetFilterColumnDef = Pick<ColDef, "filter" | "valueFormatter">;

export const multiValueSetFilterColumn: MultiValueSetFilterColumnDef = {
  filter: "agSetColumnFilter",
  valueFormatter: formatMultiValueSetFilterValue,
};

export function formatMultiValueSetFilterValue({
  value,
}: Pick<ValueFormatterParams, "value">): string {
  if (Array.isArray(value)) {
    return value.map(formatSingleValue).filter(Boolean).join(", ");
  }

  return formatSingleValue(value);
}

export function getUniqueMultiValueFilterLabels<TItem>(
  items: readonly TItem[] | null | undefined,
  getLabel: (item: TItem) => string | null | undefined,
): string[] {
  const labels = new Set<string>();

  for (const item of items ?? []) {
    const label = getLabel(item);
    if (label) {
      labels.add(label);
    }
  }

  return [...labels];
}

function formatSingleValue(value: unknown): string {
  if (value == null) {
    return "";
  }

  return String(value);
}
