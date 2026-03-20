import { Outlet, useMatch, useParams } from "react-router";
import { getPageTitle } from "~/meta";
import type { Route } from "./+types/route";
import { useAccountBook } from "~/account-books/hooks";
import { saveViewPreference, viewKey } from "~/view-preferences/functions";
import { Group, Title, Text, Tabs } from "@mantine/core";
import { LinkTab } from "~/platform/link-tab";

export const meta: Route.MetaFunction = () => [
  { title: getPageTitle("Balances") },
];

const views = ["timeline", "breakdown"];

export default function Route() {
  const { nodeId } = useParams<"nodeId">();
  const accountBook = useAccountBook();
  const match = useMatch("/:accountBookId/balances/:segment1?/:segment2?/*");
  const view = views.includes(match?.params["segment1"] ?? "")
    ? match?.params["segment1"]
    : views.includes(match?.params["segment2"] ?? "")
      ? match?.params["segment2"]
      : null;

  return (
    <>
      <Group gap="sm" align="center" justify="space-between">
        <div>
          <Title order={2} size="h3">
            Balances
          </Title>
          <Text size="sm" c="dimmed">
            Reference Currency: {accountBook.referenceCurrency}
          </Text>
        </div>
        <Tabs variant="default" value={view}>
          <Tabs.List>
            <LinkTab
              value="breakdown"
              to={
                nodeId
                  ? `/${accountBook.id}/balances/${nodeId}/breakdown`
                  : `/${accountBook.id}/balances/breakdown`
              }
              onClick={() => {
                saveViewPreference(viewKey(accountBook.id), "breakdown");
              }}
            >
              Breakdown
            </LinkTab>
            <LinkTab
              value="timeline"
              to={
                nodeId
                  ? `/${accountBook.id}/balances/${nodeId}/timeline`
                  : `/${accountBook.id}/balances/timeline`
              }
              onClick={() => {
                saveViewPreference(viewKey(accountBook.id), "timeline");
              }}
            >
              Timeline
            </LinkTab>
          </Tabs.List>
        </Tabs>
      </Group>
      <Outlet />
    </>
  );
}
