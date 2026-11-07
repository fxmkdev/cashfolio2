import { Box, Button, Group, Text } from "@mantine/core";
import { useState } from "react";
import { SET_FILTER_SPECIAL } from "@/components/grid/set-filter";
import type { ReportingGrouping } from "@/shared/reporting-grouping";
import { AccountsPageView } from "../page-view";
import { useAccountsStoryModel } from "./use-story-model";
import { getStoryViewProps } from "./view-props";
import { filterRows } from "./filter-fixtures";

export function AccountFilterHarness({
  grouping = "accountStructure",
}: {
  grouping?: ReportingGrouping;
}) {
  const options = {
    initialMode: "active",
    initialGrouping: grouping,
    bulkAssignment: true,
    expandGroups: true,
    rowsOverride: filterRows,
  } as const;
  const model = useAccountsStoryModel(options);
  const [snapshot, setSnapshot] = useState("");
  const api = () => model.bulkApiRef.current;
  return (
    <Box style={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
      <Group>
        <Button
          onClick={() =>
            void api()?.showColumnFilter(
              grouping === "assetClass" ? "path" : "assetClass",
            )
          }
        >
          Open Hierarchy Filter
        </Button>
        <Button
          onClick={() =>
            api()?.setFilterModel({
              trackingMethod: {
                filterType: "set",
                values: [SET_FILTER_SPECIAL.mixed],
              },
            })
          }
        >
          Filter Mixed Methods
        </Button>
        <Button
          onClick={() =>
            api()?.setFilterModel({
              assetClass: {
                filterType: "set",
                values: [SET_FILTER_SPECIAL.mixed],
              },
              unitIdentifier: { filterType: "set", values: ["USD"] },
            })
          }
        >
          Filter Mixed USD
        </Button>
        <Button
          onClick={() =>
            api()?.setFilterModel({
              unitIdentifier: { filterType: "set", values: ["CHF"] },
            })
          }
        >
          Filter CHF
        </Button>
        <Button onClick={() => api()?.setFilterModel(null)}>
          Clear Filters
        </Button>
        <Button
          onClick={() =>
            void model.assignments.mutations.submitAssetClass(
              ["child-chf"],
              "REAL_ESTATE",
            )
          }
        >
          Reclassify Child
        </Button>
        <Button
          onClick={() => setSnapshot(JSON.stringify(api()?.getFilterModel()))}
        >
          Read Filter State
        </Button>
        <Text data-testid="filter-state">{snapshot}</Text>
      </Group>
      <AccountsPageView {...getStoryViewProps(model, options)} />
    </Box>
  );
}
