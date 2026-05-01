import {
  Alert,
  Card,
  Container,
  Group,
  Stack,
  Tabs,
  Text,
  Title,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconCalendarMonth,
  IconListDetails,
} from "@tabler/icons-react";
import type {
  ColDef,
  FirstDataRenderedEvent,
  GridApi,
  GridReadyEvent,
  SelectionChangedEvent,
} from "ag-grid-enterprise";
import type { AgCartesianChartOptions } from "ag-charts-community";
import { AgCharts } from "ag-charts-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ensureChartModulesRegistered } from "@/ag-chart-modules";
import { DataGrid } from "@/components/data-grid";
import { LinkButton } from "@/components/link-button";
import { LinkTab } from "@/components/link-tab";
import { TopPageHeader } from "@/components/top-page-header";
import {
  getValuationCacheSeries,
  type ValuationCacheSeriesPoint,
  type ValuationCacheUnitsResponse,
  type ValuationCacheUnitRow,
} from "@/server/valuation-cache";
import {
  createDisplayNumberFormatter,
  getCryptocurrencyDecimals,
  getCurrencyDecimals,
} from "@/shared/unit-format";
import { VALUATION_BASE_CURRENCY } from "@/shared/valuation-base-currency";
import {
  getRowsForValuationUnitTab,
  resolveSelectedUnit,
  toValuationCacheSeriesInput,
  updateSelectedUnitKeyByTab,
} from "./-page-data";
import {
  formatValuationUnitTabSearchValue,
  valuationUnitTabs,
  type ValuationUnitTab,
} from "./-page-types";
import classes from "./-page-view.module.css";

ensureChartModulesRegistered();

type ChartDatum = {
  dateValue: Date;
  dateLabel: string;
  value: number;
};

type SeriesState = {
  loading: boolean;
  cacheAvailable: boolean;
  selectedUnitKey: string | null;
  points: ValuationCacheSeriesPoint[];
};

function getCachedSeriesContextText(tab: ValuationUnitTab): string {
  if (tab === "CURRENCY") {
    return `Currency cache values are ${VALUATION_BASE_CURRENCY} -> selected currency rates (valuation base currency, not account-book reference currency).`;
  }

  if (tab === "CRYPTOCURRENCY") {
    return `Cryptocurrency cache values are prices in ${VALUATION_BASE_CURRENCY} per coin (valuation base currency, not account-book reference currency).`;
  }

  return "Security cache values are prices in each security's trade currency.";
}

function getColumnsForTab(
  tab: ValuationUnitTab,
): ColDef<ValuationCacheUnitRow>[] {
  if (tab === "CURRENCY") {
    return [
      {
        headerName: "Currency",
        field: "currency",
        flex: 1,
        filter: "agTextColumnFilter",
      },
    ];
  }

  if (tab === "CRYPTOCURRENCY") {
    return [
      {
        headerName: "Cryptocurrency",
        field: "cryptocurrency",
        flex: 1,
        filter: "agTextColumnFilter",
      },
    ];
  }

  return [
    {
      headerName: "Symbol",
      field: "symbol",
      flex: 1,
      filter: "agTextColumnFilter",
    },
    {
      headerName: "Trade Currency",
      field: "tradeCurrency",
      width: 180,
      filter: "agTextColumnFilter",
    },
  ];
}

export type ValuationCachePageViewProps = {
  accountBookId: string;
  selectedTab: ValuationUnitTab;
  units: ValuationCacheUnitsResponse;
};

export function ValuationCachePageView({
  accountBookId,
  selectedTab,
  units,
}: ValuationCachePageViewProps) {
  const theme = useMantineTheme();
  const isDarkMode = useComputedColorScheme() === "dark";
  const gridApiRef = useRef<GridApi<ValuationCacheUnitRow> | null>(null);
  const [selectedUnitKeyByTab, setSelectedUnitKeyByTab] = useState<
    Partial<Record<ValuationUnitTab, string>>
  >({});
  const [seriesState, setSeriesState] = useState<SeriesState>({
    loading: false,
    cacheAvailable: true,
    selectedUnitKey: null,
    points: [],
  });

  const activeRows = useMemo(
    () => getRowsForValuationUnitTab({ units, tab: selectedTab }),
    [selectedTab, units],
  );

  const selectedUnit = useMemo(
    () =>
      resolveSelectedUnit({
        rows: activeRows,
        selectedUnitKeyByTab,
        tab: selectedTab,
      }),
    [activeRows, selectedTab, selectedUnitKeyByTab],
  );

  useEffect(() => {
    if (!selectedUnit) {
      return;
    }

    setSelectedUnitKeyByTab((current) =>
      updateSelectedUnitKeyByTab({
        selectedUnitKeyByTab: current,
        tab: selectedTab,
        unitKey: selectedUnit.unitKey,
      }),
    );
  }, [selectedTab, selectedUnit]);

  const selectGridRow = useCallback(
    (api: GridApi<ValuationCacheUnitRow>) => {
      if (!selectedUnit) {
        api.deselectAll();
        return;
      }

      const rowNode = api.getRowNode(selectedUnit.unitKey);
      if (!rowNode) {
        return;
      }

      if (!rowNode.isSelected()) {
        api.deselectAll();
        rowNode.setSelected(true);
      }
    },
    [selectedUnit],
  );

  const handleGridReady = useCallback(
    (event: GridReadyEvent<ValuationCacheUnitRow>) => {
      gridApiRef.current = event.api;
      selectGridRow(event.api);
    },
    [selectGridRow],
  );

  const handleFirstDataRendered = useCallback(
    (event: FirstDataRenderedEvent<ValuationCacheUnitRow>) => {
      selectGridRow(event.api);
    },
    [selectGridRow],
  );

  const handleSelectionChanged = useCallback(
    (event: SelectionChangedEvent<ValuationCacheUnitRow>) => {
      const selectedRow = event.api.getSelectedRows()[0];
      if (!selectedRow) {
        return;
      }

      setSelectedUnitKeyByTab((current) =>
        updateSelectedUnitKeyByTab({
          selectedUnitKeyByTab: current,
          tab: selectedTab,
          unitKey: selectedRow.unitKey,
        }),
      );
    },
    [selectedTab],
  );

  useEffect(() => {
    if (!gridApiRef.current) {
      return;
    }

    selectGridRow(gridApiRef.current);
  }, [selectGridRow]);

  useEffect(() => {
    if (!selectedUnit) {
      setSeriesState({
        loading: false,
        cacheAvailable: true,
        selectedUnitKey: null,
        points: [],
      });
      return;
    }

    let active = true;
    const nextSelectedUnitKey = selectedUnit.unitKey;

    setSeriesState((current) => ({
      loading: true,
      cacheAvailable: current.cacheAvailable,
      selectedUnitKey: nextSelectedUnitKey,
      points:
        current.selectedUnitKey === nextSelectedUnitKey ? current.points : [],
    }));

    void getValuationCacheSeries({
      data: toValuationCacheSeriesInput({
        accountBookId,
        unit: selectedUnit,
      }),
    })
      .then((result) => {
        if (!active) {
          return;
        }

        setSeriesState({
          loading: false,
          cacheAvailable: result.cacheAvailable,
          selectedUnitKey: nextSelectedUnitKey,
          points: result.points,
        });
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        console.error("Unable to load valuation cache series", error);
        setSeriesState({
          loading: false,
          cacheAvailable: false,
          selectedUnitKey: nextSelectedUnitKey,
          points: [],
        });
      });

    return () => {
      active = false;
    };
  }, [accountBookId, selectedUnit]);

  const chartData = useMemo<ChartDatum[]>(
    () =>
      seriesState.points.map((point) => ({
        dateValue: new Date(point.timestamp),
        dateLabel: point.date,
        value: point.value,
      })),
    [seriesState.points],
  );

  const numberFormatter = useMemo(() => {
    if (selectedUnit?.unitType === "CURRENCY") {
      return createDisplayNumberFormatter({
        locale: "en-CH",
        decimals: getCurrencyDecimals(selectedUnit.currency),
      });
    }

    if (selectedUnit?.unitType === "CRYPTOCURRENCY") {
      return createDisplayNumberFormatter({
        locale: "en-CH",
        decimals: getCryptocurrencyDecimals(selectedUnit.cryptocurrency),
      });
    }

    return createDisplayNumberFormatter({
      locale: "en-CH",
      decimals: 0,
    });
  }, [selectedUnit]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-CH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
    [],
  );

  const chartTextColor = isDarkMode ? theme.colors.dark[0] : theme.black;
  const tooltipBackgroundColor = isDarkMode
    ? theme.colors.dark[6]
    : theme.white;
  const tooltipTextColor = isDarkMode ? theme.colors.gray[0] : theme.black;
  const tooltipSubtleTextColor = isDarkMode
    ? theme.colors.gray[3]
    : theme.colors.gray[7];
  const themeBorderColor = isDarkMode
    ? theme.colors.dark[4]
    : theme.colors.gray[3];

  const chartOptions = useMemo<AgCartesianChartOptions>(
    () => ({
      data: chartData,
      background: {
        visible: false,
      },
      theme: {
        params: {
          textColor: chartTextColor,
          foregroundColor: chartTextColor,
          borderColor: themeBorderColor,
          tooltipBackgroundColor,
          tooltipBorder: true,
          tooltipTextColor,
          tooltipSubtleTextColor,
        },
      },
      legend: {
        enabled: false,
      },
      series: [
        {
          type: "line",
          xKey: "dateValue",
          yKey: "value",
          yName: selectedUnit?.label ?? "Cached value",
          stroke: isDarkMode ? theme.colors.teal[3] : theme.colors.teal[8],
          strokeWidth: 3,
          marker: {
            size: 5,
            fill: isDarkMode ? theme.colors.teal[4] : theme.colors.teal[7],
            stroke: isDarkMode ? theme.colors.teal[3] : theme.colors.teal[8],
          },
          tooltip: {
            renderer: ({ datum }) => {
              const point = datum as ChartDatum;
              return {
                heading: point.dateLabel,
                data: [
                  {
                    label: "Cached value",
                    value: numberFormatter.format(point.value),
                  },
                ],
              };
            },
          },
        },
      ],
      axes: {
        x: {
          type: "time",
          label: {
            rotation: -30,
            formatter: ({ value }) => dateFormatter.format(new Date(value)),
          },
        },
        y: {
          type: "number",
          label: {
            formatter: ({ value }) => numberFormatter.format(Number(value)),
          },
        },
      },
    }),
    [
      chartData,
      chartTextColor,
      dateFormatter,
      isDarkMode,
      numberFormatter,
      selectedUnit?.label,
      theme,
      themeBorderColor,
      tooltipBackgroundColor,
      tooltipSubtleTextColor,
      tooltipTextColor,
    ],
  );

  const gridColumns = useMemo(
    () => getColumnsForTab(selectedTab),
    [selectedTab],
  );
  const seriesContextText = useMemo(
    () => getCachedSeriesContextText(selectedTab),
    [selectedTab],
  );

  return (
    <Container fluid py="xl" px="xl" className={classes.page}>
      <TopPageHeader
        heading={<Title order={2}>Valuation Cache</Title>}
        actions={
          <Group>
            <LinkButton
              variant="default"
              leftSection={<IconListDetails size={16} />}
              to="/$accountBookId/accounts"
              params={{ accountBookId }}
              search={{ tab: "ASSET", mode: "active" }}
            >
              Accounts
            </LinkButton>
            <LinkButton
              variant="default"
              leftSection={<IconCalendarMonth size={16} />}
              to="/$accountBookId/period"
              params={{ accountBookId }}
            >
              Period
            </LinkButton>
          </Group>
        }
      />

      <Tabs value={selectedTab}>
        <Tabs.List mb="md">
          {valuationUnitTabs.map((tab) => (
            <LinkTab
              key={tab.value}
              value={tab.value}
              to="/$accountBookId/valuation-cache"
              params={{ accountBookId }}
              search={{
                tab: formatValuationUnitTabSearchValue(tab.value),
              }}
            >
              {tab.label}
            </LinkTab>
          ))}
        </Tabs.List>
      </Tabs>

      <div className={classes.contentLayout}>
        <Card withBorder radius="md" p="lg" className={classes.unitsCard}>
          <Stack gap={4}>
            <Text fw={600}>Units</Text>
            <Text c="dimmed" size="sm">
              Unique units in this account book ({selectedTab.toLowerCase()}).
            </Text>
          </Stack>

          {activeRows.length === 0 ? (
            <Text c="dimmed" mt="md">
              No units found for this tab.
            </Text>
          ) : (
            <div className={classes.gridContainer}>
              <DataGrid
                rowData={activeRows}
                columnDefs={gridColumns}
                rowSelection="single"
                onGridReady={handleGridReady}
                onFirstDataRendered={handleFirstDataRendered}
                onSelectionChanged={handleSelectionChanged}
                getRowId={({ data }) => data.unitKey}
              />
            </div>
          )}
        </Card>

        <Card withBorder radius="md" p="lg" className={classes.chartCard}>
          <Stack gap={4}>
            <Text fw={600}>Cached Price/Rate History</Text>
            {selectedUnit ? (
              <Text c="dimmed" size="sm">
                {selectedUnit.label}
              </Text>
            ) : (
              <Text c="dimmed" size="sm">
                Select a unit to display its cached history.
              </Text>
            )}
            <Text c="dimmed" size="sm">
              {seriesContextText}
            </Text>
          </Stack>

          {!selectedUnit ? (
            <Text c="dimmed" mt="md">
              No unit selected.
            </Text>
          ) : seriesState.loading ? (
            <Text c="dimmed" mt="md">
              Loading cached series...
            </Text>
          ) : !seriesState.cacheAvailable ? (
            <Alert
              mt="md"
              color="yellow"
              icon={<IconAlertTriangle size={16} />}
            >
              Cache is currently unavailable. Showing no cached history.
            </Alert>
          ) : chartData.length === 0 ? (
            <Text c="dimmed" mt="md">
              No cached prices/rates found for this unit.
            </Text>
          ) : (
            <div className={classes.chartContainer}>
              <AgCharts options={chartOptions} className={classes.chart} />
            </div>
          )}
        </Card>
      </div>
    </Container>
  );
}
