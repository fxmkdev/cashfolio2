import { AgCharts } from "ag-charts-react";
import {
  useLoaderData,
  useNavigate,
  type LoaderFunctionArgs,
} from "react-router";
import { ensureAuthorizedForUserAndAccountBookId } from "~/account-books/functions.server";
import { decrementPeriod } from "~/period/functions";
import { getPeriodDateRangeFromPeriod } from "~/period/functions";
import { defaultChartOptions, defaultChartTheme } from "~/platform/charts";
import { defaultShouldRevalidate } from "~/revalidation";
import { serialize } from "~/serialization";
import { getBalanceSheet } from "../functions.server";
import type { AgChartOptions } from "ag-charts-community";
import { formatISODate, formatMoney } from "~/formatting";
import { format, parseISO } from "date-fns";
import { getTheme } from "~/theme";
import {
  getInitialTimelinePeriod,
  parseRange,
  TimelineSelector,
} from "~/period/timeline";
import {
  getNumberOfPeriods,
  redirectToLastUsedTimelineRange,
} from "~/period/timeline.server";
import { ensureUser } from "~/users/functions.server";
import invariant from "tiny-invariant";
import { Box } from "@mantine/core";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await ensureUser(request);

  invariant(params.accountBookId, "accountBookId not found");
  const link = await ensureAuthorizedForUserAndAccountBookId(
    user,
    params.accountBookId,
  );

  if (!params.range) throw await redirectToLastUsedTimelineRange(user, link);

  const range = parseRange(params.range);
  const period = getInitialTimelinePeriod(range);
  const n = await getNumberOfPeriods(link.accountBookId, range, {
    includeOpeningPeriod: true,
  });

  const periods = new Array(n).fill(null);

  periods[0] = period;
  for (let i = 1; i < n; i++) {
    periods[i] = decrementPeriod(periods[i - 1]);
  }

  const balanceSheets = (
    await Promise.all(
      periods.map(async (p) => {
        const periodDateRange = getPeriodDateRangeFromPeriod(p);
        return {
          periodDateRange,
          balanceSheet: await getBalanceSheet(
            link.accountBookId,
            periodDateRange.to,
          ),
        };
      }),
    )
  ).toReversed();

  return serialize({
    period,
    rangeSpecifier: params.range,
    range,
    balanceSheets,
  });
}

export const shouldRevalidate = defaultShouldRevalidate;

export default function Route() {
  const loaderData = useLoaderData<typeof loader>();
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
  const balanceTooltipRenderer = (params: any) => ({
    title: format(params.datum.date, "dd MMM yyyy"),
    data: [{ label: params.yName, value: formatMoney(params.yValue as number) }],
  });

  return (
    <>
      <TimelineSelector
        period={loaderData.period}
        rangeSpecifier={loaderData.rangeSpecifier}
        range={loaderData.range}
      />
      <Box mt="sm">
        <AgCharts
          style={{ height: "calc(100vh - 16rem)" }}
          options={
            {
              ...defaultChartOptions,
              theme: {
                ...defaultChartTheme,
                palette: {
                  fills: [
                    positiveFillColor,
                    negativeFillColor,
                    neutralFillColor,
                  ],
                },
              },
              series: [
                {
                  type: "area",
                  xKey: "date",
                  yKey: "assets",
                  yName: "Assets",
                  marker: { enabled: true },
                  interpolation: { type: "smooth" },
                  tooltip: {
                    renderer: balanceTooltipRenderer,
                  },
                },
                {
                  type: "area",
                  xKey: "date",
                  yKey: "liabilities",
                  yName: "Liabilities",
                  marker: { enabled: true },
                  interpolation: { type: "smooth" },
                  tooltip: {
                    renderer: balanceTooltipRenderer,
                  },
                },
                {
                  type: "line",
                  xKey: "date",
                  yKey: "netWorth",
                  yName: "Net Worth",
                  marker: { enabled: true },
                  interpolation: { type: "smooth" },
                  tooltip: {
                    renderer: balanceTooltipRenderer,
                  },
                },
              ],
              formatter: {
                y: (params) => formatMoney(params.value as number),
              },
              listeners: {
                seriesNodeDoubleClick: (event) => {
                  navigate(`../breakdown/${formatISODate(event.datum.date)}`);
                },
              },
              axes: {
                x: {
                  type: "time",
                  label:
                    loaderData.period.granularity === "quarter"
                      ? {
                          formatter: (params) =>
                            format(params.value, "QQQ yyyy"),
                        }
                      : undefined,
                },
              },
              data: loaderData.balanceSheets.map(
                ({ periodDateRange, balanceSheet }) => ({
                  date: parseISO(periodDateRange.to),
                  assets: balanceSheet.assets.balance,
                  liabilities: -balanceSheet.liabilities.balance,
                  netWorth: balanceSheet.equity,
                }),
              ),
            } as AgChartOptions
          }
        />
      </Box>
    </>
  );
}
