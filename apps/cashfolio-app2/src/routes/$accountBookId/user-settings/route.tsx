import { Text, Title } from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { TopPageHeader } from "@/components/top-page-header";

export const Route = createFileRoute("/$accountBookId/user-settings")({
  component: UserSettingsPage,
});

function UserSettingsPage() {
  return (
    <PageShell>
      <TopPageHeader heading={<Title order={2}>User Settings</Title>} />
      <Text c="dimmed">User settings will be available here soon.</Text>
    </PageShell>
  );
}
