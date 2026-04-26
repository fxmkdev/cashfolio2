import { createFileRoute } from "@tanstack/react-router";
import { PeriodPageContent } from "./route";

export const Route = createFileRoute("/$accountBookId/period/")({
  component: PeriodIndexPage,
});

function PeriodIndexPage() {
  return <PeriodPageContent />;
}
