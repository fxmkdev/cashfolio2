import { Group, Tabs } from "@mantine/core";
import type { ReactNode } from "react";
import { LinkTab } from "@/components/navigation/link-tab";

export function SettingsNavigation({
  accountBookId,
  categories,
  classifications = false,
  actions,
}: {
  accountBookId: string;
  categories: boolean;
  classifications?: boolean;
  actions?: ReactNode;
}) {
  return (
    <Group align="flex-start" gap="xs" mb="md">
      <Tabs
        value={
          classifications
            ? "classifications"
            : categories
              ? "categories"
              : "general"
        }
        flex={1}
        miw={0}
      >
        <Tabs.List aria-label="Account Book Settings">
          <LinkTab
            value="general"
            to="/$accountBookId/settings"
            params={{ accountBookId }}
          >
            General
          </LinkTab>
          <LinkTab
            value="categories"
            to="/$accountBookId/settings/categories"
            params={{ accountBookId }}
            search={{ tab: "EQUITY-INCOME", showArchived: false }}
          >
            Categories
          </LinkTab>
          <LinkTab
            value="classifications"
            to="/$accountBookId/settings/classifications"
            params={{ accountBookId }}
          >
            Asset Classes
          </LinkTab>
        </Tabs.List>
      </Tabs>
      {actions}
    </Group>
  );
}
