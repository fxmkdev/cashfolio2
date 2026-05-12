import { Select, TreeSelect } from "@mantine/core";
import { useMemo } from "react";
import type { PeriodTimelineResponse } from "@/server/period-timeline";
import {
  isTimelineScopedMetric,
  isTimelineScopeSelection,
  type TimelineScopeSelection,
} from "@/shared/timeline-scope";
import {
  isTimelineMetric,
  TIMELINE_METRIC_OPTIONS,
  type TimelineMetric,
} from "./-page-types";
import {
  buildTimelineScopeTreeData,
  getTimelineScopeTreeSearchLabel,
} from "./-scope-tree";

type TimelineScopeControlsProps = {
  selectedMetric: TimelineMetric;
  scopeSelection: PeriodTimelineResponse["scopeSelection"];
  scopeOptions: PeriodTimelineResponse["scopeOptions"];
  onMetricChange: (metric: TimelineMetric) => void;
  onMetricScopeChange: (scope: TimelineScopeSelection) => void;
};

export function TimelineScopeControls({
  selectedMetric,
  scopeSelection,
  scopeOptions,
  onMetricChange,
  onMetricScopeChange,
}: TimelineScopeControlsProps) {
  const isScopedMetric = isTimelineScopedMetric(selectedMetric);
  const selectedScope = isScopedMetric
    ? scopeSelection[selectedMetric]
    : "total";
  const metricScopeOptions = isScopedMetric ? scopeOptions[selectedMetric] : [];
  const scopeTreeData = useMemo(
    () => buildTimelineScopeTreeData(metricScopeOptions),
    [metricScopeOptions],
  );

  return (
    <>
      <Select
        label="View"
        value={selectedMetric}
        data={TIMELINE_METRIC_OPTIONS}
        allowDeselect={false}
        onChange={(nextMetric) => {
          if (isTimelineMetric(nextMetric)) {
            onMetricChange(nextMetric);
          }
        }}
      />
      <TreeSelect
        label="Scope"
        aria-label="Timeline metric scope"
        placeholder={
          isScopedMetric
            ? "Select account group or account"
            : "Available for Income, Expenses, Assets, and Liabilities"
        }
        data={scopeTreeData}
        value={isScopedMetric ? selectedScope : null}
        disabled={!isScopedMetric}
        searchable
        allowDeselect={false}
        comboboxProps={{ withinPortal: false }}
        nothingFoundMessage="Nothing found"
        filter={(query, node) =>
          getTimelineScopeTreeSearchLabel(node)
            .toLowerCase()
            .includes(query.trim().toLowerCase())
        }
        onChange={(nextScopeValue) => {
          if (
            isScopedMetric &&
            isTimelineScopeSelection(nextScopeValue) &&
            nextScopeValue !== selectedScope
          ) {
            onMetricScopeChange(nextScopeValue);
          }
        }}
      />
    </>
  );
}
