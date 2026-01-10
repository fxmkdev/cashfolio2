import {
  redirect,
  useLoaderData,
  useNavigate,
  useRouteLoaderData,
} from "react-router";
import invariant from "tiny-invariant";
import { type loader as breakdownLoader } from "../route";
import { AgCharts } from "ag-charts-react";
import { serialize } from "~/serialization";
import { defaultChartOptions } from "~/platform/charts";
import { formatMoney, percentageNumberFormat } from "~/formatting";
import type { AgChartOptions } from "ag-charts-enterprise";
import type { Route } from "./+types/route";
import { sum } from "~/utils";
import { Subheading } from "~/platform/heading";

export function loader({ params }: Route.LoaderArgs) {
  if (!params.chartType) {
    return redirect("./assets");
  }

  return serialize({ chartType: params.chartType });
}

export default function Route() {
  const { chartType } = useLoaderData<typeof loader>();
  const breakdownLoaderData = useRouteLoaderData<typeof breakdownLoader>(
    "balances/breakdown/route",
  );
  const navigate = useNavigate();
  invariant(breakdownLoaderData, "Loader data is required");

  const { node } = breakdownLoaderData;

  const chartDataItems =
    node?.children
      .map((c) => ({
        ...c,
        balance: chartType === "assets" ? c.balance : -c.balance,
      }))
      .filter((c) => c.balance >= 0) ?? [];
  const totalBalance = sum(chartDataItems.map((c) => c.balance));
  return (
    <>
      <AgCharts
        className="h-[calc(100vh_-_18.5rem)] mt-4"
        options={
          {
            ...defaultChartOptions,
            legend: {
              position: "right",
            },
            series: [
              {
                type: "donut",
                calloutLabelKey: "name",
                sectorLabelKey: "allocation",
                angleKey: "balance",
                tooltip: {
                  renderer: (params) => {
                    return {
                      title: params.datum.name,
                      data: [
                        {
                          label: "Balance",
                          value: formatMoney(params.datum.balance),
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
                listeners: {
                  seriesNodeDoubleClick: (e) => {
                    if (e.datum.nodeType === "accountGroup") {
                      navigate(`../../../balances/${e.datum.id}`);
                    } else {
                      navigate(`../../../accounts/${e.datum.id}`);
                    }
                  },
                },
              },
            ],
            formatter: {
              angle: (params) => formatMoney(params.value as number),
              sectorLabel: (params) =>
                percentageNumberFormat.format(params.value as number),
            },
            data: chartDataItems.map((c) => ({
              ...c,
              balance: c.balance,
              allocation: c.balance / totalBalance,
            })),
          } as AgChartOptions
        }
      />
      <Subheading className="text-center mt-4">
        Total: {formatMoney(totalBalance)}
      </Subheading>
    </>
  );
}
