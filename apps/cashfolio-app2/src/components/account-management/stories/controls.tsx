import { Button, Group, Text } from "@mantine/core";
import { useRouter, useRouterState } from "@tanstack/react-router";
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
  const router = useRouter();
  const location = useRouterState({ select: (state) => state.location });
  return (
    <>
      {options.organizeHistory && (
        <Group>
          <Button onClick={() => router.history.back()}>Browser Back</Button>
          <Button onClick={() => router.history.forward()}>
            Browser Forward
          </Button>
          <Button
            onClick={() =>
              void router.navigate({
                to: "/$accountBookId/accounts",
                params: { accountBookId: "storybook-book" },
                search: { tab: "BALANCE", mode: "active" },
              })
            }
          >
            Navigate to Accounts
          </Button>
          <Text data-testid="history-index">{location.state.__TSR_index}</Text>
          <Text data-testid="history-href">{location.href}</Text>
        </Group>
      )}
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
