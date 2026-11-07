import { Box, Text } from "@mantine/core";
import { useMemo, useRef, useState, type ComponentType } from "react";
import { createOrganizerStoryApi } from "@/components/hierarchy-organize/story-fixtures";
import { SettingsNavigation } from "../../settings/-settings-navigation";
import { AccountsPageView } from "../-page-view";
import type { AccountsPageViewProps } from "../-page-view-types";
import { AccountBookStoryShell } from "../../-story-shell";
import { StoryControls } from "./controls";
import { useAccountsStoryModel } from "./use-story-model";
import { getStoryViewProps } from "./view-props";
import type { AccountsStoryOptions } from "./types";

export type AccountsPageStoryHarnessProps = AccountsStoryOptions & {
  View?: ComponentType<AccountsPageViewProps>;
  showDebugControls?: boolean;
  withShell?: boolean;
};

export function AccountsPageStoryHarness({
  View = AccountsPageView,
  showDebugControls = true,
  withShell = false,
  ...options
}: AccountsPageStoryHarnessProps) {
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
  const content = (
    <Box
      style={{
        display: "flex",
        flexDirection: "column",
        height: withShell ? undefined : "100dvh",
        flex: 1,
        minHeight: 0,
      }}
    >
      {showDebugControls && <StoryControls model={model} options={options} />}
      {routing.isEquityTab && (
        <SettingsNavigation accountBookId="storybook-book" categories />
      )}
      <View
        {...getStoryViewProps(model, options)}
        organizerApi={
          routing.isEquityTab
            ? (options.organizerApi ?? categoryApi)
            : organizerApi
        }
      />
      {showDebugControls && options.routeSmoke && (
        <>
          <Text data-testid="router-path">{routing.pathname}</Text>
          <Text data-testid="router-search">
            {JSON.stringify(routing.routeSearch)}
          </Text>
        </>
      )}
    </Box>
  );
  return withShell ? (
    <AccountBookStoryShell>{content}</AccountBookStoryShell>
  ) : (
    content
  );
}
