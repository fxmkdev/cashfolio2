import { Button, Text } from "@mantine/core";
import type { useAccountsStoryModel } from "./use-story-model";
import type { AccountsStoryOptions } from "./types";

export function StoryControls({
  model,
  options,
}: {
  model: ReturnType<typeof useAccountsStoryModel>;
  options: AccountsStoryOptions;
}) {
  const { bulkApiRef, assignments, setGainLossState } = model;
  return (
    <>
      {options.bulkAssignment && (
        <>
          <Button
            onClick={() =>
              bulkApiRef.current?.setFilterModel({
                "ag-Grid-AutoColumn": {
                  filterType: "text",
                  type: "equals",
                  filter: "Checking",
                },
              })
            }
          >
            Filter to Checking
          </Button>
          <Button onClick={() => bulkApiRef.current?.setFilterModel(null)}>
            Clear Account Filters
          </Button>
          <Text data-testid="assignment-account-ids">
            {assignments.submittedAccountIds.join(",")}
          </Text>
          <Button onClick={() => assignments.setScope("second")}>
            Change Account Book
          </Button>
          <Text data-testid="assignment-refreshes">
            Refreshes: {assignments.refreshCount}; invalidations:{" "}
            {assignments.invalidationCount}
          </Text>
        </>
      )}
      {options.toggleGainLossLoading && (
        <Button
          onClick={() =>
            setGainLossState((state) =>
              state === "loading" ? "ready" : "loading",
            )
          }
        >
          Toggle gain/loss loading
        </Button>
      )}
    </>
  );
}
