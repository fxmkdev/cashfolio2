import { ensureAuthorized } from "~/account-books/functions.server";
import type { Route } from "./+types/route";
import { serialize } from "~/serialization";
import type { YearPeriod } from "~/period/types";
import { getYear } from "date-fns";
import { today } from "~/dates";
import { getPeriodDateRangeFromPeriod } from "~/period/functions";
import { getIncome } from "../functions.server";
import {
  getAccountsTree,
  type AccountsNode,
} from "~/account-groups/accounts-tree";
import invariant from "tiny-invariant";
import { getIncomeByNodeId } from "../calculation.server";
import { useLoaderData } from "react-router";
import { Decimal } from "@prisma/client-runtime-utils";
import {
  type AgChartOptions,
  type AgSankeySeriesOptions,
} from "ag-charts-enterprise";
import { defaultChartOptions } from "~/platform/charts";
import { AgCharts } from "ag-charts-react";
import { formatMoney } from "~/formatting";
import { isExpensesNode, isIncomeNode } from "../functions";

export async function loader({ request, params }: Route.LoaderArgs) {
  const link = await ensureAuthorized(request, params);

  const currentPeriod: YearPeriod = {
    granularity: "year",
    year: getYear(today()) - 1,
  };

  const { from, to } = getPeriodDateRangeFromPeriod(currentPeriod);
  const income = await getIncome(link.accountBookId, from, to);

  const equityRootNode = getAccountsTree(
    income.accounts,
    income.accountGroups,
  ).EQUITY;
  invariant(equityRootNode, "Root equity account group not found");

  const incomeByNodeId = getIncomeByNodeId(income, equityRootNode);

  let data = new Array<{
    from: string;
    to: string;
    value: Decimal;
    type: "inflow" | "outflow";
  }>();

  data = data.concat(
    equityRootNode.children.flatMap((c) => getLinksForNode(c, "Income")),
  );

  function getLinksForNode(
    n: AccountsNode,
    linkedNode: string,
    level = 0,
  ): typeof data {
    const parentLink = incomeByNodeId.get(n.id)!.isNegative()
      ? {
          from: n.name,
          to: linkedNode,
          value: incomeByNodeId.get(n.id)!.abs() || new Decimal(0),
          type: "inflow",
        }
      : {
          from: linkedNode,
          to: n.name,
          value: incomeByNodeId.get(n.id) || new Decimal(0),
          type: "outflow",
        };

    return [
      parentLink as (typeof data)[number],

      ...(n.nodeType === "accountGroup" &&
      (isIncomeNode(n) || isExpensesNode(n)) &&
      level + 1 < (isIncomeNode(n) ? 3 : 2)
        ? n.children.flatMap((child) =>
            getLinksForNode(child, n.name, level + 1),
          )
        : []),
    ];
  }

  const netIncome = incomeByNodeId.get(equityRootNode.id) ?? new Decimal(0);

  data = data.concat(
    netIncome.isNegative()
      ? {
          from: "Income",
          to: "Net Income",
          value: netIncome.abs(),
          type: "outflow",
        }
      : {
          from: "Net Income",
          to: "Income",
          value: netIncome,
          type: "inflow",
        },
  );

  return serialize({ data });
}

export default function Route() {
  const { data } = useLoaderData<typeof loader>();
  return (
    <div>
      <AgCharts
        className="h-[calc(100vh-13rem)] mt-12"
        options={
          {
            ...defaultChartOptions,
            series: [
              {
                type: "sankey",
                fromKey: "from",
                toKey: "to",
                sizeKey: "value",
                tooltip: {
                  renderer: (params) => ({
                    title:
                      params.datum.type === "inflow"
                        ? params.datum.from
                        : params.datum.to,
                  }),
                },
                node: { alignment: "center" },
              } as AgSankeySeriesOptions,
            ],
            data,
            legend: { enabled: false },
            formatter: {
              size: (params) => formatMoney(params.value as number),
            },
          } as AgChartOptions
        }
      />
    </div>
  );
}
