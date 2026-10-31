import { TreeSelect } from "@mantine/core";
import { useMemo, useState } from "react";
import type { PeriodHistoryResponse } from "@/server/period-history";
import { isHistoryScopedMetric } from "@/shared/history-scope";
import {
  HISTORY_METRIC_OPTIONS,
  type HistoryMetric,
  type HistoryViewSelection,
} from "./-page-types";
import {
  buildHistoryViewTreeData,
  getHistoryScopeTreeSearchLabel,
  getHistoryViewTreeSelection,
  getHistoryViewTreeValue,
  isHistoryGroupingBranch,
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
  const [opened, setOpened] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [expandedValues, setExpandedValues] = useState<string[]>([]);
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
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      allowDeselect={false}
      expandOnClick={false}
      dropdownOpened={opened}
      onDropdownOpen={() => setOpened(true)}
      onDropdownClose={() => setOpened(false)}
      expandedValues={expandedValues}
      onExpandedChange={setExpandedValues}
      comboboxProps={{
        withinPortal: false,
        onOptionSubmit: (nextValue: string) => {
          if (isHistoryGroupingBranch(nextValue)) {
            setExpandedValues((previous) =>
              previous.includes(nextValue)
                ? previous.filter((value) => value !== nextValue)
                : [...previous, nextValue],
            );
            return;
          }
          const selection = getHistoryViewTreeSelection(
            nextValue,
            scopeOptions,
          );
          if (selection) {
            if (nextValue !== selectedValue) onViewChange(selection);
            const option = isHistoryScopedMetric(selection.metric)
              ? scopeOptions[selection.metric].find(
                  (option) => option.value === selection.scope,
                )
              : undefined;
            setSearchValue(
              option?.treeLabel ??
                (selection.scope === "total"
                  ? HISTORY_METRIC_OPTIONS.find(
                      (option) => option.value === selection.metric,
                    )!.label
                  : (option?.label ?? "")),
            );
            setOpened(false);
          }
        },
      }}
      nothingFoundMessage="Nothing found"
      filter={(query, node) =>
        getHistoryScopeTreeSearchLabel(node)
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      }
    />
  );
}
