import { Tabs } from "@mantine/core";
import { LinkTab } from "@/components/navigation/link-tab";

export function SettingsNavigation({
  accountBookId,
  categories,
  classifications = false,
  dangerZone = false,
}: {
  accountBookId: string;
  categories: boolean;
  classifications?: boolean;
  dangerZone?: boolean;
}) {
  return (
    <Tabs
      value={
        dangerZone
          ? "danger-zone"
          : classifications
            ? "classifications"
            : categories
              ? "categories"
              : "general"
      }
      mb="md"
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
        <LinkTab
          value="danger-zone"
          to="/$accountBookId/settings/danger-zone"
          params={{ accountBookId }}
          ml="auto"
          c="red"
          color="red"
        >
          Danger Zone
        </LinkTab>
      </Tabs.List>
    </Tabs>
  );
}
