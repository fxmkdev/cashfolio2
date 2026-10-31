import { useEffect, useMemo, useRef } from "react";
import type { AgChartInstance, AgChartOptions } from "ag-charts-community";
import type { HistoryPeriodMode } from "./-page-types";
import type { HistoryChartDatum } from "./-chart-data";
import { getDefaultRangeButtonLabel } from "./-range-controls";

function findHistoryRangeButtons(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      ".ag-charts-range-buttons--buttons .ag-charts-toolbar__button",
    ),
  );
}

function clickRangeButtonByLabel(args: {
  container: HTMLElement;
  label: string;
}): boolean {
  const matchingButton = findHistoryRangeButtons(args.container).find(
    (button) => {
      const buttonLabel = button
        .querySelector(".ag-charts-toolbar__label")
        ?.textContent?.trim();
      return buttonLabel === args.label;
    },
  );

  if (!matchingButton) {
    return false;
  }

  matchingButton.click();
  return true;
}

export function useDefaultHistoryChartRange({
  selectedMode,
  chartData,
}: {
  selectedMode: HistoryPeriodMode;
  chartData: HistoryChartDatum[];
}) {
  const chartRef = useRef<AgChartInstance<AgChartOptions> | null>(null);
  const appliedDefaultRangeModeRef = useRef<HistoryPeriodMode | null>(null);
  const defaultRangeButtonLabel = useMemo(
    () => getDefaultRangeButtonLabel(selectedMode),
    [selectedMode],
  );
  useEffect(() => {
    if (chartData.length === 0) {
      return;
    }

    if (appliedDefaultRangeModeRef.current === selectedMode) {
      return;
    }

    let animationFrameId = 0;
    const clickDefaultRangeButton = (attemptsLeft: number) => {
      const chartElement = chartRef.current?.getOptions().container;
      if (!(chartElement instanceof HTMLElement)) {
        if (attemptsLeft > 0) {
          animationFrameId = window.requestAnimationFrame(() =>
            clickDefaultRangeButton(attemptsLeft - 1),
          );
        }
        return;
      }

      if (
        clickRangeButtonByLabel({
          container: chartElement,
          label: defaultRangeButtonLabel,
        })
      ) {
        appliedDefaultRangeModeRef.current = selectedMode;
        return;
      }

      if (attemptsLeft > 0) {
        animationFrameId = window.requestAnimationFrame(() =>
          clickDefaultRangeButton(attemptsLeft - 1),
        );
      }
    };

    // Wait one frame so AG Charts can mount range-controls toolbar elements.
    animationFrameId = window.requestAnimationFrame(() =>
      clickDefaultRangeButton(4),
    );
    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [defaultRangeButtonLabel, chartData, selectedMode]);

  return chartRef;
}
