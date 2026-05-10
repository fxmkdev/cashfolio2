import { Combobox, InputBase, Select, useCombobox } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import type { PeriodTimelineResponse } from "@/server/period-timeline";
import {
  isTimelineScopedMetric,
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

  const scopeLabelByValue = useMemo(
    () =>
      new Map(metricScopeOptions.map((option) => [option.value, option.label])),
    [metricScopeOptions],
  );
  const selectedScopeLabel =
    scopeLabelByValue.get(selectedScope) ??
    scopeLabelByValue.get("total") ??
    "Total";
  const [scopeSearchValue, setScopeSearchValue] = useState(selectedScopeLabel);
  const scopeCombobox = useCombobox({
    onDropdownClose: () => {
      scopeCombobox.resetSelectedOption();
    },
  });
  const filteredScopeOptions = useMemo(() => {
    const normalizedSearch = scopeSearchValue.trim().toLowerCase();
    const shouldFilterOptions = metricScopeOptions.every(
      (option) => option.label !== scopeSearchValue,
    );

    if (!shouldFilterOptions || normalizedSearch.length === 0) {
      return metricScopeOptions;
    }

    return metricScopeOptions.filter((option) =>
      option.label.toLowerCase().includes(normalizedSearch),
    );
  }, [metricScopeOptions, scopeSearchValue]);

  useEffect(() => {
    setScopeSearchValue(selectedScopeLabel);
  }, [selectedScopeLabel]);

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
      <Combobox
        store={scopeCombobox}
        withinPortal={false}
        onOptionSubmit={(nextScopeValue) => {
          if (!isScopedMetric) {
            return;
          }

          const matchedOption = metricScopeOptions.find(
            (option) => option.value === nextScopeValue,
          );
          if (!matchedOption) {
            return;
          }

          setScopeSearchValue(matchedOption.label);
          scopeCombobox.closeDropdown();
          scopeCombobox.resetSelectedOption();

          if (nextScopeValue !== selectedScope) {
            onMetricScopeChange(matchedOption.value);
          }
        }}
      >
        <Combobox.Target>
          <InputBase
            label="Scope"
            aria-label="Timeline metric scope"
            placeholder={
              isScopedMetric
                ? "Select account group or account"
                : "Available for Income and Expenses"
            }
            value={isScopedMetric ? scopeSearchValue : ""}
            disabled={!isScopedMetric}
            rightSection={<Combobox.Chevron />}
            rightSectionPointerEvents="none"
            onFocus={() => {
              if (!isScopedMetric) {
                return;
              }
              scopeCombobox.openDropdown();
              scopeCombobox.updateSelectedOptionIndex("selected");
            }}
            onClick={(event) => {
              if (!isScopedMetric) {
                return;
              }
              scopeCombobox.openDropdown();
              scopeCombobox.updateSelectedOptionIndex("selected");
              event.currentTarget.select();
            }}
            onChange={(event) => {
              setScopeSearchValue(event.currentTarget.value);
              if (!isScopedMetric) {
                return;
              }
              scopeCombobox.openDropdown();
              scopeCombobox.updateSelectedOptionIndex();
            }}
            onBlur={() => {
              if (!isScopedMetric) {
                return;
              }
              scopeCombobox.closeDropdown();
              setScopeSearchValue(selectedScopeLabel);
            }}
          />
        </Combobox.Target>

        <Combobox.Dropdown hidden={!isScopedMetric}>
          <Combobox.Options>
            {filteredScopeOptions.length > 0 ? (
              filteredScopeOptions.map((option) => (
                <Combobox.Option
                  value={option.value}
                  key={option.value}
                  active={option.value === selectedScope}
                >
                  {option.label}
                </Combobox.Option>
              ))
            ) : (
              <Combobox.Empty>Nothing found</Combobox.Empty>
            )}
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>
    </>
  );
}
