import { Center, SegmentedControl } from "@mantine/core";
import { IconChartBar, IconChartDonut, IconTable } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { BreakdownChartType } from "../-breakdown/-breakdown-types";

export type ChartTypeOption<TValue extends string> = {
  value: TValue;
  label: string;
  icon: ReactNode;
};

export const DEFAULT_BREAKDOWN_CHART_TYPE_OPTIONS = [
  {
    value: "donut",
    label: "Donut",
    icon: <IconChartDonut size={16} />,
  },
  {
    value: "bar",
    label: "Bar",
    icon: <IconChartBar size={16} />,
  },
  {
    value: "table",
    label: "Table",
    icon: <IconTable size={16} />,
  },
] as const satisfies readonly ChartTypeOption<BreakdownChartType>[];

type ChartTypeSegmentedControlProps<TValue extends string> = {
  ariaLabel: string;
  value: TValue;
  options: readonly ChartTypeOption<TValue>[];
  onChange: (value: TValue) => void;
};

export function ChartTypeSegmentedControl<TValue extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: ChartTypeSegmentedControlProps<TValue>) {
  const allowedValues = new Set<string>(options.map((option) => option.value));

  return (
    <SegmentedControl
      size="sm"
      aria-label={ariaLabel}
      value={value}
      onChange={(nextValue) => {
        if (allowedValues.has(nextValue)) {
          onChange(nextValue as TValue);
        }
      }}
      data={options.map((option) => ({
        value: option.value,
        label: (
          <Center style={{ gap: 6 }}>
            {option.icon}
            {option.label}
          </Center>
        ),
      }))}
    />
  );
}
