import { Box, Text } from "@mantine/core";
import { useMemo, useRef, useState } from "react";
import { createOrganizerStoryApi } from "@/components/hierarchy-organize/story-fixtures";
import { SettingsNavigation } from "@/routes/$accountBookId/settings/-settings-navigation";
import { AccountsPageView } from "../view";
import { StoryControls } from "./controls";
import { useAccountsStoryModel } from "./use-story-model";
import { getStoryViewProps } from "./view-props";
import type { AccountsStoryOptions } from "./types";

export function AccountsPageStoryHarness(options: AccountsStoryOptions) {
  const [organizerApi] = useState(
    () =>
      options.organizerApi ??
      (options.organize ? createOrganizerStoryApi() : undefined),
  );
  const model = useAccountsStoryModel(options);
  const { routing } = model;
  const categoryRows = useRef(model.presentation.rows);
  categoryRows.current = model.presentation.rows;
  const categoryApi = useMemo(() => {
    const subtype = routing.tab === "EQUITY-INCOME" ? "INCOME" : "EXPENSE";
    const rows = categoryRows.current.filter(
      (row) =>
        !row.isVirtualArchivedGroup &&
        !row.presentationKind &&
        row.equityAccountSubtype === subtype,
    );
    const api = createOrganizerStoryApi(
      undefined,
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        nodeType: row.nodeType,
        parentId:
          row.persistedParentId !== undefined
            ? row.persistedParentId
            : (row.parentId ?? null),
        sortOrder: row.sortOrder,
        isActive: row.isActive,
        isCashAccount: false,
        unit: null,
      })),
    );
    const load = api.load;
    api.load = async () => {
      const snapshot = await load();
      for (const row of rows) {
        const availability = snapshot.actionAvailability[row.id];
        if (availability && row.nodeType === "account" && !row.deletable) {
          availability.deletable = false;
          availability.deleteDisabledReason = row.deleteDisabledReason;
        }
      }
      return snapshot;
    };
    return { ...api, kind: "categories" as const };
  }, [routing.tab]);
  return (
    <Box style={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
      <StoryControls model={model} options={options} />
      {routing.isEquityTab && (
        <SettingsNavigation accountBookId="storybook-book" categories />
      )}
      <AccountsPageView
        {...getStoryViewProps(model, options)}
        organizerApi={
          routing.isEquityTab
            ? (options.organizerApi ?? categoryApi)
            : organizerApi
        }
      />
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
