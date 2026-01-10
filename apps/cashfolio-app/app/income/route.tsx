import {
  redirect,
  useLoaderData,
  useNavigate,
  type LoaderFunctionArgs,
} from "react-router";
import { ensureAuthorizedForUserAndAccountBookId } from "~/account-books/functions.server";
import { defaultShouldRevalidate } from "~/revalidation";
import { serialize } from "~/serialization";
import { getIncomeByNodeId } from "./calculation.server";
import { getPeriodDateRangeFromPeriod } from "~/period/functions";
import { AgCharts } from "ag-charts-react";
import { formatMoney, percentageNumberFormat } from "~/formatting";
import { format, getQuarter, getYear, parseISO } from "date-fns";
import { decrementPeriod } from "~/period/functions";
import { findSubtreeRootNode, isExpensesNode, isIncomeNode } from "./functions";
import { sum } from "~/utils.server";
import { defaultChartOptions, defaultChartTheme } from "~/platform/charts";
import {
  getInitialTimelinePeriod,
  parseRange,
  TimelineSelector,
} from "~/period/timeline";
import { getNumberOfPeriods } from "~/period/timeline.server";
import { ensureUser } from "~/users/functions.server";
import invariant from "tiny-invariant";
import type { MonthPeriod, QuarterPeriod, TimelineView } from "~/period/types";
import type {
  AgBarSeriesOptions,
  AgChartOptions,
  AgLineSeriesOptions,
} from "ag-charts-enterprise";
import { useAccountBook } from "~/account-books/hooks";
import { getMinBookingDate } from "~/transactions/functions.server";
import { mergeById } from "~/utils";
import { getAccountsTree } from "~/account-groups/accounts-tree";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "~/platform/table";
import { IncomeTableRows } from "./table-rows";
import { getPageTitle } from "~/meta";
import { Button } from "~/platform/button";
import { ChevronUpIcon } from "~/platform/icons/standard";
import { Heading } from "~/platform/heading";
import { Text } from "~/platform/text";
import { prisma } from "~/prisma.server";
import { AccountType } from "~/.prisma-client/client";
import { getViewPreference } from "~/view-preferences/functions.server";
import { timelineRangeKey } from "~/view-preferences/functions";
import type { Route } from "./+types/route";
import { getIncome } from "./functions.server";
import { getTheme } from "~/theme";

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: getPageTitle(`Income / ${loaderData.rootNode.name}`) },
];

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await ensureUser(request);

  invariant(params.accountBookId, "accountBookId not found");

  const link = await ensureAuthorizedForUserAndAccountBookId(
    user,
    params.accountBookId,
  );

  if (!params.nodeId) {
    const equityRootNode = await prisma.accountGroup.findFirstOrThrow({
      where: {
        accountBookId: link.accountBookId,
        type: AccountType.EQUITY,
        parentGroupId: null,
      },
    });
    throw redirect(`../income/${equityRootNode.id}`);
  }

  if (!params.range) {
    const lastUsedTimelineRange =
      getViewPreference(user, timelineRangeKey(link.accountBookId)) ?? "12m";

    throw redirect(`../income/${params.nodeId}/${lastUsedTimelineRange}`);
  }

  if (!params.view) {
    throw redirect(`../income/${params.nodeId}/${params.range}/totals`);
  }

  const range = parseRange(params.range);

  const rollingAveragePeriods =
    range.granularity === "year" ? 3 : range.granularity === "quarter" ? 8 : 12;

  const period = getInitialTimelinePeriod(range);
  const [minBookingDate, n] = await Promise.all([
    getMinBookingDate(link.accountBookId),
    getNumberOfPeriods(link.accountBookId, range, { rollingAveragePeriods }),
  ]);

  const periods = new Array(n).fill(null);

  periods[0] = period;
  for (let i = 1; i < n; i++) {
    periods[i] = decrementPeriod(periods[i - 1]);
  }

  const periodDateRanges = periods
    .map((p) => getPeriodDateRangeFromPeriod(p))
    .toReversed();

  const rawTimeline = await Promise.all(
    periodDateRanges.map(async (dr) => ({
      periodDateRange: dr,
      income: await getIncome(link.accountBookId, dr.from, dr.to),
    })),
  );

  const equityRootNode = getAccountsTree(
    mergeById(...rawTimeline.map((i) => i.income.accounts)),
    mergeById(...rawTimeline.map((i) => i.income.accountGroups)),
  ).EQUITY;
  invariant(equityRootNode, "Equity root node not found");

  const rootNode = findSubtreeRootNode(equityRootNode, params.nodeId);
  if (!rootNode) {
    throw new Response("Not Found", { status: 404 });
  }

  const timeline = rawTimeline
    .map(({ periodDateRange, income }) => ({
      periodDateRange,
      incomeByNodeId: getIncomeByNodeId(income, equityRootNode),
    }))
    .map(({ periodDateRange, incomeByNodeId }, index, array) => ({
      periodDateRange,
      incomeByNodeId,
      rollingAverageByNodeId: new Map(
        [...incomeByNodeId.keys()].map((key) => [
          key,
          sum(
            array
              .slice(Math.max(0, index - rollingAveragePeriods + 1), index + 1)
              .map((i) => i.incomeByNodeId.get(key) ?? 0),
          ).dividedBy(Math.min(rollingAveragePeriods, index + 1)),
        ]),
      ),
    }))
    .slice(-range.numberOfPeriods);

  const isExpensesGroup = rootNode && isExpensesNode(rootNode);
  const isIncomeGroup = rootNode && isIncomeNode(rootNode);
  const isBreakdownAllocationAvailable = isExpensesGroup || isIncomeGroup;

  if (
    params.view === "breakdown-allocation" &&
    !isBreakdownAllocationAvailable
  ) {
    throw redirect(`../income/${params.nodeId}/${params.range}/breakdown`);
  }

  return serialize({
    view: params.view as TimelineView,
    period,
    rangeSpecifier: params.range,
    range,
    isBreakdownAllocationAvailable,
    isExpensesGroup,
    timeline: timeline.map(
      ({ periodDateRange, incomeByNodeId, rollingAverageByNodeId }) => ({
        periodDateRange,
        // TODO we should move that to the serialization layer
        incomeByNodeId: Object.fromEntries(incomeByNodeId),
        rollingAverageByNodeId: Object.fromEntries(rollingAverageByNodeId),
      }),
    ),
    rootNode,
    minBookingDate,
    rollingAveragePeriods,
  });
}

export const shouldRevalidate = defaultShouldRevalidate;

export default function Route() {
  const {
    view,
    rootNode,
    timeline,
    period,
    range,
    rangeSpecifier,
    minBookingDate,
    isBreakdownAllocationAvailable,
    isExpensesGroup,
    rollingAveragePeriods,
  } = useLoaderData<typeof loader>();

  const { referenceCurrency } = useAccountBook();

  const navigate = useNavigate();
  const negativeFillColor =
    getTheme() === "dark"
      ? "oklch(57.7% 0.245 27.325)"
      : "oklch(50.5% 0.213 27.518)";
  const positiveFillColor =
    getTheme() === "dark"
      ? "oklch(62.7% 0.194 149.214)"
      : "oklch(52.7% 0.154 150.069)";

  const neutralFillColor =
    getTheme() === "dark"
      ? "oklch(87.1% 0.006 286.286)"
      : "oklch(55.2% 0.016 285.938)";
  const neutralStrokeColor =
    getTheme() === "dark"
      ? "oklch(96.7% 0.001 286.375)"
      : "oklch(14.1% 0.005 285.823)";

  const tooltipOptions =
    period.granularity === "quarter"
      ? {
          renderer: (params: any) => ({
            heading: format(params.datum.date, "QQQ yyyy"),
          }),
        }
      : undefined;
  const accountBook = useAccountBook();
  const parentNodeId =
    rootNode.nodeType === "accountGroup"
      ? rootNode.parentGroupId
      : rootNode.groupId;

  return (
    <>
      <div className="flex justify-between items-center gap-8">
        <div className="shrink-0">
          <Heading>{rootNode.name}</Heading>
          <Text>Reference Currency: {accountBook.referenceCurrency}</Text>
        </div>
        <div>
          <Button
            disabled={!parentNodeId}
            hierarchy="secondary"
            href={`../income/${parentNodeId}/${rangeSpecifier}/breakdown`}
          >
            <ChevronUpIcon />
            Up
          </Button>
        </div>

        <TimelineSelector
          period={period}
          rangeSpecifier={rangeSpecifier}
          range={range}
          view={view}
          minBookingDate={minBookingDate}
          nodeId={rootNode.id}
          isBreakdownAllocationAvailable={isBreakdownAllocationAvailable}
        />
      </div>
      {view === "breakdown-table" ? (
        <Table
          dense
          bleed
          striped
          className="mt-8 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]"
        >
          <TableHead>
            <TableRow>
              <TableHeader>{rootNode.name}</TableHeader>
              <TableHeader className="text-right w-32">
                {formatMoney(timeline[0].incomeByNodeId[rootNode.id] ?? 0)}
              </TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            <IncomeTableRows
              node={rootNode}
              incomeByNodeId={timeline[0].incomeByNodeId}
              options={{
                queryParams: {
                  from: parseISO(timeline[0].periodDateRange.from),
                  to: parseISO(timeline[0].periodDateRange.to),
                },
              }}
            />
          </TableBody>
        </Table>
      ) : view === "breakdown-allocation" ? (
        <AgCharts
          className="h-[calc(100vh_-_13rem)] mt-12"
          options={
            {
              ...defaultChartOptions,
              legend: {
                position: "right",
              },
              series: [
                {
                  type: "donut",
                  angleKey: "value",
                  calloutLabelKey: "name",
                  sectorLabelKey: "allocation",
                  tooltip: {
                    renderer: (params) => {
                      return {
                        title: params.datum.name,
                        data: [
                          {
                            label: "Amount",
                            value: formatMoney(params.datum.value),
                          },
                          {
                            label: "Allocation",
                            value: percentageNumberFormat.format(
                              params.datum.allocation as number,
                            ),
                          },
                        ],
                      };
                    },
                  },
                  innerLabels: [
                    {
                      text: `${referenceCurrency} ${formatMoney(
                        isExpensesGroup
                          ? -timeline[0].incomeByNodeId[rootNode.id]
                          : timeline[0].incomeByNodeId[rootNode.id],
                      )}`,
                      fontSize: 20,
                      fontWeight: 600,
                    },
                  ],
                },
              ],
              formatter: {
                angle: (params) => formatMoney(params.value as number),
                sectorLabel: (params) =>
                  percentageNumberFormat.format(params.value as number),
              },
              listeners: {
                seriesNodeDoubleClick: (event) => {
                  invariant(!!range.period, "Range period not found");

                  if (event.datum.nodeType === "accountGroup") {
                    navigate(
                      `../income/${event.datum.id}/${rangeSpecifier}/breakdown-allocation`,
                    );
                  } else {
                    const periodSpecifier =
                      period.granularity === "year"
                        ? range.period.year.toString()
                        : period.granularity === "quarter"
                          ? `${range.period.year}-q${(range.period as QuarterPeriod).quarter}`
                          : `${range.period.year}-${((range.period as MonthPeriod).month + 1).toString().padStart(2, "0")}`;

                    navigate(
                      `../accounts/${event.datum.id}/${periodSpecifier}`,
                    );
                  }
                },
              },
              data: (rootNode.nodeType === "accountGroup"
                ? rootNode.children
                : []
              )
                .map((c) =>
                  isExpensesGroup
                    ? { ...c, value: -timeline[0].incomeByNodeId[c.id] }
                    : { ...c, value: timeline[0].incomeByNodeId[c.id] },
                )
                .map((c) => ({
                  ...c,
                  allocation:
                    c.value /
                    (isExpensesGroup
                      ? -timeline[0].incomeByNodeId[rootNode.id]
                      : timeline[0].incomeByNodeId[rootNode.id]),
                }))
                .toSorted((a, b) => b.value - a.value),
            } as AgChartOptions
          }
        />
      ) : (
        <AgCharts
          key={view}
          className="h-[calc(100vh_-_13rem)] mt-12"
          options={{
            ...defaultChartOptions,
            title:
              view === "breakdown" && timeline.length === 1
                ? {
                    text: `Total: ${referenceCurrency} ${formatMoney(isExpensesGroup ? -timeline[0].incomeByNodeId[rootNode.id] : timeline[0].incomeByNodeId[rootNode.id])}`,
                  }
                : undefined,
            theme:
              view === "totals"
                ? {
                    ...defaultChartTheme,
                    palette: {
                      fills: [neutralFillColor],
                    },
                  }
                : defaultChartTheme,
            series: [
              ...(view === "totals"
                ? [
                    {
                      type: "bar",
                      xKey: "date",
                      yKey: "total",
                      yName: "Total",
                      tooltip: tooltipOptions,
                      itemStyler: (params) => {
                        return {
                          fill:
                            isExpensesGroup || params.yValue < 0
                              ? negativeFillColor
                              : positiveFillColor,
                        };
                      },
                    } as AgBarSeriesOptions,
                  ]
                : (rootNode.nodeType === "accountGroup"
                    ? rootNode.children
                    : []
                  )
                    .toSorted((a, b) => {
                      if (rootNode.nodeType !== "accountGroup") {
                        return Infinity;
                      }

                      const lastItem = timeline[timeline.length - 1];
                      const sortOrder =
                        (lastItem.rollingAverageByNodeId[b.id] ?? Infinity) -
                        (lastItem.rollingAverageByNodeId[a.id] ?? Infinity);

                      return isExpensesGroup ? sortOrder : -sortOrder;
                    })
                    .map(
                      (childNode) =>
                        ({
                          type: "bar",
                          xKey: "date",
                          yKey: childNode.id,
                          yName: childNode.name,
                          stacked: true,
                          tooltip: tooltipOptions,
                        }) as AgBarSeriesOptions,
                    )),
              ...(view === "totals"
                ? [
                    {
                      type: "line",
                      xKey: "date",
                      yKey: "totalRollingAverage",
                      yName: `Rolling Average (${rollingAveragePeriods}${
                        period.granularity === "year"
                          ? "Y"
                          : period.granularity === "quarter"
                            ? "Q"
                            : "M"
                      })`,
                      marker: { enabled: false },
                      stroke: neutralStrokeColor,
                      lineDash: [6, 4],
                      tooltip: tooltipOptions,
                      interpolation: { type: "smooth" },
                    } as AgLineSeriesOptions,
                  ]
                : []),
            ],
            formatter: {
              y: (params) => formatMoney(params.value as number),
            },
            listeners: {
              seriesNodeDoubleClick: (event) => {
                const periodSpecifier =
                  period.granularity === "year"
                    ? getYear(event.datum.date)
                    : period.granularity === "quarter"
                      ? format(event.datum.date, "yyyy-QQQ").toLowerCase()
                      : format(event.datum.date, "yyyy-MM");
                if (view === "totals") {
                  if (rootNode.nodeType === "accountGroup") {
                    navigate(
                      `../income/${rootNode.id}/${periodSpecifier}/breakdown`,
                    );
                  } else {
                    navigate(`../accounts/${rootNode.id}/${periodSpecifier}`);
                  }
                  return;
                }

                navigate(`../income/${event.yKey}/${rangeSpecifier}/totals`);
              },
            },
            axes: {
              x: {
                type: "unit-time",
                label:
                  timeline.length === 1
                    ? {
                        formatter: () =>
                          period.granularity === "month"
                            ? "Month to Date"
                            : period.granularity === "quarter"
                              ? "Quarter to Date"
                              : "Year to Date",
                      }
                    : period.granularity === "quarter"
                      ? {
                          formatter: (params) => `Q${getQuarter(params.value)}`,
                        }
                      : undefined,
              },
            },
            data: timeline
              .map((i) => ({
                date: parseISO(i.periodDateRange.from),
                total: -(i.incomeByNodeId[rootNode.id] ?? 0),
                totalRollingAverage: -(
                  i.rollingAverageByNodeId[rootNode.id] ?? 0
                ),
                ...Object.fromEntries(
                  (rootNode.nodeType === "accountGroup"
                    ? rootNode.children
                    : []
                  ).map((child) => [
                    child.id,
                    -(i.incomeByNodeId[child.id] ?? 0),
                  ]),
                ),
              }))
              .map(({ date, ...values }) => ({
                date,
                ...Object.fromEntries(
                  Object.entries(values).map(([key, value]) => [
                    key,
                    isExpensesGroup ? -value : value,
                  ]),
                ),
              })),
          }}
        />
      )}
    </>
  );
}
