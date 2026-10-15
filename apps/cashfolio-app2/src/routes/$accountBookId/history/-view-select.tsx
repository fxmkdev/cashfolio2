import { TreeSelect } from "@mantine/core";
import { useMemo } from "react";
import type { PeriodHistoryResponse } from "@/server/period-history";
import { isHistoryScopedMetric } from "@/shared/history-scope";
import type { HistoryMetric, HistoryViewSelection } from "./-page-types";
import {
  buildHistoryViewTreeData,
  getHistoryScopeTreeSearchLabel,
  getHistoryViewTreeSelection,
  getHistoryViewTreeValue,
} from "./-scope-tree";

type HistoryViewSelectProps = {
  disabled?: boolean;
  selectedMetric: HistoryMetric;
  scopeSelection: PeriodHistoryResponse["scopeSelection"];
  scopeOptions: PeriodHistoryResponse["scopeOptions"];
  onViewChange: (selection: HistoryViewSelection) => void;
};

export function HistoryViewSelect({
  disabled = false,
  selectedMetric,
  scopeSelection,
  scopeOptions,
  onViewChange,
}: HistoryViewSelectProps) {
  const selectedValue = getHistoryViewTreeValue({
    metric: selectedMetric,
    scope: isHistoryScopedMetric(selectedMetric)
      ? scopeSelection[selectedMetric]
      : "total",
  });
  const treeData = useMemo(
    () => buildHistoryViewTreeData(scopeOptions),
    [scopeOptions],
  );

  return (
    <TreeSelect
      label="View"
      disabled={disabled}
      data={treeData}
      value={selectedValue}
      searchable
      allowDeselect={false}
      expandOnClick={false}
      comboboxProps={{ withinPortal: false }}
      nothingFoundMessage="Nothing found"
      filter={(query, node) =>
        getHistoryScopeTreeSearchLabel(node)
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      }
      onChange={(nextValue) => {
        const selection = getHistoryViewTreeSelection(nextValue, scopeOptions);
        if (selection && nextValue !== selectedValue) {
          onViewChange(selection);
        }
      }}
    />
  );
}
