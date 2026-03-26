import { createFileRoute } from "@tanstack/react-router";
import { LedgerPageContent } from "../$accountId";

export const Route = createFileRoute("/$accountBookId/$accountId/")({
  component: LedgerIndexPage,
});

function LedgerIndexPage() {
  return <LedgerPageContent />;
}
