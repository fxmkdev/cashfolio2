import { Select } from "@mantine/core";
import type { ComponentProps } from "react";
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

type TimelineScopeControlsProps = {
  selectedMetric: TimelineMetric;
  scopeSelection: PeriodTimelineResponse["scopeSelection"];
  scopeOptions: PeriodTimelineResponse["scopeOptions"];
  onMetricChange: (metric: TimelineMetric) => void;
  onMetricScopeChange: (scope: TimelineScopeSelection) => void;
};

const TIMELINE_SCOPE_DROPDOWN_MAX_HEIGHT = 260;

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
      <Select
        label="Scope"
        aria-label="Timeline metric scope"
        placeholder={
          isScopedMetric
            ? "Select account group or account"
            : "Available for Income and Expenses"
        }
        value={isScopedMetric ? selectedScope : null}
        data={metricScopeOptions}
        disabled={!isScopedMetric}
        searchable
        allowDeselect={false}
        maxDropdownHeight={TIMELINE_SCOPE_DROPDOWN_MAX_HEIGHT}
        nothingFoundMessage="Nothing found"
        comboboxProps={{ withinPortal: false }}
        scrollAreaProps={{
          viewportProps: {
            "data-testid": "timeline-scope-options-viewport",
          } as ComponentProps<"div">,
        }}
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
