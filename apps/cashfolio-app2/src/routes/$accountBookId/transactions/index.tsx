import { createFileRoute } from "@tanstack/react-router";
import { TransactionsPageContent } from "./route";

export const Route = createFileRoute("/$accountBookId/transactions/")({
  component: TransactionsIndexPage,
});

function TransactionsIndexPage() {
  return <TransactionsPageContent />;
}
