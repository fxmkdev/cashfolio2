import { Center, SegmentedControl } from "@mantine/core";
import { IconChartBar, IconChartDonut } from "@tabler/icons-react";
import type { BreakdownChartType } from "./-breakdown-types";

type ChartTypeSegmentedControlProps = {
  ariaLabel: string;
  value: BreakdownChartType;
  onChange: (value: BreakdownChartType) => void;
};

function isBreakdownChartType(value: string): value is BreakdownChartType {
  return value === "donut" || value === "bar";
}

export function ChartTypeSegmentedControl({
  ariaLabel,
  value,
  onChange,
}: ChartTypeSegmentedControlProps) {
  return (
    <SegmentedControl
      size="sm"
      aria-label={ariaLabel}
      value={value}
      onChange={(nextValue) => {
        if (isBreakdownChartType(nextValue)) {
          onChange(nextValue);
        }
      }}
      data={[
        {
          label: (
            <Center style={{ gap: 6 }}>
              <IconChartDonut size={16} />
              Donut
            </Center>
          ),
          value: "donut",
        },
        {
          label: (
            <Center style={{ gap: 6 }}>
              <IconChartBar size={16} />
              Bar
            </Center>
          ),
          value: "bar",
        },
      ]}
    />
  );
}
