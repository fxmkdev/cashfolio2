import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/$accountBookId/")({
  component: AccountBookIndexRedirect,
});

function AccountBookIndexRedirect() {
  const { accountBookId } = Route.useParams();

  return (
    <Navigate
      to="/$accountBookId/accounts"
      params={{ accountBookId }}
      search={{ tab: "ASSET", mode: "active" }}
      replace
    />
  );
}
