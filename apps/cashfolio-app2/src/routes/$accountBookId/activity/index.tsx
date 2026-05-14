import { createFileRoute } from "@tanstack/react-router";
import { ActivityPageContent } from "./route";

export const Route = createFileRoute("/$accountBookId/activity/")({
  component: ActivityIndexPage,
});

function ActivityIndexPage() {
  return <ActivityPageContent />;
}
