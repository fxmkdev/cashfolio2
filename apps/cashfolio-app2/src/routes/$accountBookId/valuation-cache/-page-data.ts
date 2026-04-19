import type {
  ValuationCacheUnitRow,
  ValuationCacheUnitsResponse,
} from "@/server/valuation-cache";
import type { ValuationUnitTab } from "./-page-types";

type SelectedUnitKeyByTab = Partial<Record<ValuationUnitTab, string>>;

export function getRowsForValuationUnitTab(args: {
  units: ValuationCacheUnitsResponse;
  tab: ValuationUnitTab;
}): ValuationCacheUnitRow[] {
  if (args.tab === "CURRENCY") {
    return args.units.currencyUnits;
  }

  if (args.tab === "CRYPTOCURRENCY") {
    return args.units.cryptocurrencyUnits;
  }

  return args.units.securityUnits;
}

export function resolveSelectedUnit(args: {
  rows: ValuationCacheUnitRow[];
  selectedUnitKeyByTab: SelectedUnitKeyByTab;
  tab: ValuationUnitTab;
}): ValuationCacheUnitRow | null {
  const selectedUnitKey = args.selectedUnitKeyByTab[args.tab];
  if (selectedUnitKey) {
    const selectedRow = args.rows.find(
      (row) => row.unitKey === selectedUnitKey,
    );
    if (selectedRow) {
      return selectedRow;
    }
  }

  return args.rows[0] ?? null;
}

export function updateSelectedUnitKeyByTab(args: {
  selectedUnitKeyByTab: SelectedUnitKeyByTab;
  tab: ValuationUnitTab;
  unitKey: string;
}): SelectedUnitKeyByTab {
  if (args.selectedUnitKeyByTab[args.tab] === args.unitKey) {
    return args.selectedUnitKeyByTab;
  }

  return {
    ...args.selectedUnitKeyByTab,
    [args.tab]: args.unitKey,
  };
}

export function toValuationCacheSeriesInput(args: {
  accountBookId: string;
  unit: ValuationCacheUnitRow;
}) {
  return {
    accountBookId: args.accountBookId,
    unitType: args.unit.unitType,
    currency: args.unit.currency,
    cryptocurrency: args.unit.cryptocurrency,
    symbol: args.unit.symbol,
    tradeCurrency: args.unit.tradeCurrency,
  };
}
