import { assetClassOptions } from "./asset-class";
import type {
  HistoryScopeOption,
  HistoryScopeSelection,
} from "./history-scope";
const GAIN_LOSS_ROOT_SCOPE_ORDER: HistoryScopeSelection[] = [
  ...assetClassOptions.map((option) => `asset-class:${option.value}` as const),
  "asset-class:unclassified",
];

export function createHistoryScopeOptionsWithTotal(
  options: Iterable<HistoryScopeOption>,
  args?: { sort?: "label" | "none" },
): HistoryScopeOption[] {
  const optionByValue = new Map<HistoryScopeSelection, HistoryScopeOption>();
  for (const option of options) {
    if (option.value !== "total") optionByValue.set(option.value, option);
  }

  const dedupedOptions = Array.from(optionByValue.values());
  const sortedOptions =
    args?.sort === "none"
      ? dedupedOptions
      : dedupedOptions.toSorted(
          (left, right) =>
            left.label.localeCompare(right.label, "en") ||
            left.value.localeCompare(right.value, "en"),
        );
  return [
    {
      value: "total",
      label: "Total",
      kind: "total",
    },
    ...sortedOptions,
  ];
}

function resolveGainLossScopeOptionPath(args: {
  option: HistoryScopeOption;
  optionByValue: Map<HistoryScopeSelection, HistoryScopeOption>;
}): HistoryScopeOption[] {
  const path: HistoryScopeOption[] = [];
  const visitedValues = new Set<HistoryScopeSelection>();
  let currentOption: HistoryScopeOption | undefined = args.option;

  while (currentOption && !visitedValues.has(currentOption.value)) {
    path.unshift(currentOption);
    visitedValues.add(currentOption.value);
    currentOption = currentOption.parentValue
      ? args.optionByValue.get(currentOption.parentValue)
      : undefined;
  }

  return path;
}

function compareGainLossScopeOptionPaths(
  leftPath: HistoryScopeOption[],
  rightPath: HistoryScopeOption[],
): number {
  const leftRootRank =
    leftPath[0]!.sortOrder ??
    GAIN_LOSS_ROOT_SCOPE_ORDER.indexOf(leftPath[0]!.value);
  const rightRootRank =
    rightPath[0]!.sortOrder ??
    GAIN_LOSS_ROOT_SCOPE_ORDER.indexOf(rightPath[0]!.value);
  const leftRank =
    leftRootRank === -1 ? GAIN_LOSS_ROOT_SCOPE_ORDER.length : leftRootRank;
  const rightRank =
    rightRootRank === -1 ? GAIN_LOSS_ROOT_SCOPE_ORDER.length : rightRootRank;
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  const maxLength = Math.max(leftPath.length, rightPath.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftOption = leftPath[index];
    const rightOption = rightPath[index];
    if (!leftOption) {
      return -1;
    }
    if (!rightOption) {
      return 1;
    }

    const orderComparison =
      (leftOption.sortOrder ?? Number.MAX_SAFE_INTEGER) -
      (rightOption.sortOrder ?? Number.MAX_SAFE_INTEGER);
    if (orderComparison !== 0) return orderComparison;
    const labelComparison =
      leftOption.label.localeCompare(rightOption.label, "en") ||
      leftOption.value.localeCompare(rightOption.value, "en");
    if (labelComparison !== 0) {
      return labelComparison;
    }
  }

  return 0;
}

export function sortGainLossScopeOptions(
  options: Iterable<HistoryScopeOption>,
): HistoryScopeOption[] {
  const optionByValue = new Map(
    Array.from(options, (option) => [option.value, option]),
  );

  return Array.from(optionByValue.values()).toSorted((left, right) =>
    compareGainLossScopeOptionPaths(
      resolveGainLossScopeOptionPath({ option: left, optionByValue }),
      resolveGainLossScopeOptionPath({ option: right, optionByValue }),
    ),
  );
}

export function clampHistoryScopeSelection(args: {
  requested: HistoryScopeSelection;
  options: HistoryScopeOption[];
}): HistoryScopeSelection {
  if (args.options.some((option) => option.value === args.requested)) {
    return args.requested;
  }

  return "total";
}
