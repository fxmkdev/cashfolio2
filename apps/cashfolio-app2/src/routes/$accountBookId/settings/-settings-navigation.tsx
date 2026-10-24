import { Tabs } from "@mantine/core";
import { LinkTab } from "@/components/navigation/link-tab";

export function SettingsNavigation({
  accountBookId,
  categories,
}: {
  accountBookId: string;
  categories: boolean;
}) {
  return (
    <Tabs value={categories ? "categories" : "general"} mb="md">
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
          search={{ tab: "EQUITY-INCOME", mode: "active" }}
        >
          Categories
        </LinkTab>
      </Tabs.List>
    </Tabs>
  );
}
