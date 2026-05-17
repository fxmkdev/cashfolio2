import { createFileRoute } from "@tanstack/react-router";
import { ReportPageContent } from "./route";

export const Route = createFileRoute("/$accountBookId/report/")({
  component: ReportIndexPage,
});

function ReportIndexPage() {
  return <ReportPageContent />;
}
