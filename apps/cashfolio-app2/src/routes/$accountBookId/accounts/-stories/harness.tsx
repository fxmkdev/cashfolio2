import { Box, Text } from "@mantine/core";
import { SettingsNavigation } from "../../settings/-settings-navigation";
import { AccountsPageView } from "../-page-view";
import { StoryControls } from "./controls";
import { useAccountsStoryModel } from "./use-story-model";
import { getStoryViewProps } from "./view-props";
import type { AccountsStoryOptions } from "./types";

export function AccountsPageStoryHarness(options: AccountsStoryOptions) {
  const model = useAccountsStoryModel(options);
  const { routing } = model;
  return (
    <Box style={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
      <StoryControls model={model} options={options} />
      {routing.isEquityTab && (
        <SettingsNavigation accountBookId="storybook-book" categories />
      )}
      <AccountsPageView {...getStoryViewProps(model, options)} />
      {options.routeSmoke && (
        <>
          <Text data-testid="router-path">{routing.pathname}</Text>
          <Text data-testid="router-search">
            {JSON.stringify(routing.routeSearch)}
          </Text>
        </>
      )}
    </Box>
  );
}
