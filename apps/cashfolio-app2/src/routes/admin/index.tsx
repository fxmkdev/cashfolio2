import { Stack, Text, Title } from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";
import { TopPageHeader } from "@/components/top-page-header";
import { createDocumentTitleHead } from "@/shared/document-title";

export const Route = createFileRoute("/admin/")({
  head: () => createDocumentTitleHead("Admin"),
  component: AdminOverviewPage,
});

function AdminOverviewPage() {
  return (
    <Stack gap="md">
      <TopPageHeader heading={<Title order={2}>Admin</Title>} />
      <Text c="dimmed">Coming soon</Text>
    </Stack>
  );
}
