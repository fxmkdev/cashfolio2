import { Select, TreeSelect } from "@mantine/core";
import { useMemo } from "react";
import type { PeriodHistoryResponse } from "@/server/period-history";
import {
  isHistoryScopedMetric,
  isHistoryScopeSelection,
  type HistoryScopeSelection,
} from "@/shared/history-scope";
import {
  isHistoryMetric,
  HISTORY_METRIC_OPTIONS,
  type HistoryMetric,
} from "./-page-types";
import {
  buildHistoryScopeTreeData,
  getHistoryScopeTreeSearchLabel,
} from "./-scope-tree";

type HistoryScopeControlsProps = {
  selectedMetric: HistoryMetric;
  scopeSelection: PeriodHistoryResponse["scopeSelection"];
  scopeOptions: PeriodHistoryResponse["scopeOptions"];
  onMetricChange: (metric: HistoryMetric) => void;
  onMetricScopeChange: (scope: HistoryScopeSelection) => void;
};

export function HistoryScopeControls({
  selectedMetric,
  scopeSelection,
  scopeOptions,
  onMetricChange,
  onMetricScopeChange,
}: HistoryScopeControlsProps) {
  const isScopedMetric = isHistoryScopedMetric(selectedMetric);
  const selectedScope = isScopedMetric
    ? scopeSelection[selectedMetric]
    : "total";
  const scopeTreeData = useMemo(() => {
    if (!isHistoryScopedMetric(selectedMetric)) {
      return [];
    }

    return buildHistoryScopeTreeData(scopeOptions[selectedMetric]);
  }, [scopeOptions, selectedMetric]);

  return (
    <>
      <Select
        label="View"
        value={selectedMetric}
        data={HISTORY_METRIC_OPTIONS}
        allowDeselect={false}
        onChange={(nextMetric) => {
          if (isHistoryMetric(nextMetric)) {
            onMetricChange(nextMetric);
          }
        }}
      />
      <TreeSelect
        label="Scope"
        aria-label="History Metric Scope"
        data={scopeTreeData}
        value={isScopedMetric ? selectedScope : null}
        disabled={!isScopedMetric}
        searchable
        allowDeselect={false}
        comboboxProps={{ withinPortal: false }}
        nothingFoundMessage="Nothing found"
        filter={(query, node) =>
          getHistoryScopeTreeSearchLabel(node)
            .toLowerCase()
            .includes(query.trim().toLowerCase())
        }
        onChange={(nextScopeValue) => {
          if (
            isScopedMetric &&
            isHistoryScopeSelection(nextScopeValue) &&
            nextScopeValue !== selectedScope
          ) {
            onMetricScopeChange(nextScopeValue);
          }
        }}
      />
    </>
  );
}
