import { index, route } from "@react-router/dev/routes";
import { routes as accountRoutes } from "../accounts/routes";
import { routes as account2Routes } from "../accounts2/routes";
import { routes as accountGroupRoutes } from "../account-groups/routes";
import { routes as transactionRoutes } from "../transactions/routes";
import { routes as incomeRoutes } from "../income/routes";
import { routes as balanceRoutes } from "../balances/routes";

export const routes = [
  route("account-books/create", "account-books/actions/create.ts"),
  route("account-books/update", "account-books/actions/update.ts"),
  route("account-books/delete", "account-books/actions/delete.ts"),

  route(":accountBookId", "account-books/route.tsx", [
    index("account-books/home/route.ts"),
    route("settings", "account-books/settings/route.tsx"),

    ...balanceRoutes,
    ...incomeRoutes,
    ...accountRoutes,
    ...account2Routes,
    ...accountGroupRoutes,
    ...transactionRoutes,
  ]),
];
