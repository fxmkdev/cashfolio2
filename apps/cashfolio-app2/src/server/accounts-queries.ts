import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../prisma.server";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import { createGroupPathResolver } from "./accounts-helpers";
import {
  type AccountReferenceBalancesInput,
  type AccountsPageDataInput,
  type AccountTreeDataInput,
  queryAccountGroups,
  queryAccountReferenceBalances,
  queryAccountsPageData,
  queryAccountTreeData,
  queryExistingNodes,
} from "./accounts-queries-orchestration";

export const getAccounts = createServerFn({ method: "GET" })
  .inputValidator((data: { accountBookId: string }) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const [accounts, allGroups] = await Promise.all([
      prisma.account.findMany({
        where: { accountBookId: data.accountBookId },
        include: { group: true },
        orderBy: { name: "asc" },
      }),
      prisma.accountGroup.findMany({
        where: { accountBookId: data.accountBookId },
      }),
    ]);
    const resolveGroupPath = createGroupPathResolver(allGroups);
    return accounts
      .map((a) => ({
        ...a,
        groupPath: a.groupId ? resolveGroupPath(a.groupId) : "",
      }))
      .toSorted((a, b) =>
        `${a.groupPath} / ${a.name}`.localeCompare(
          `${b.groupPath} / ${b.name}`,
        ),
      );
  });

export const getAccountGroups = createServerFn({ method: "GET" })
  .inputValidator((data: { accountBookId: string }) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    return queryAccountGroups(data.accountBookId);
  });

export const getExistingNodes = createServerFn({ method: "GET" })
  .inputValidator((data: { accountBookId: string }) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    return queryExistingNodes(data.accountBookId);
  });

export const getAccountTreeData = createServerFn({ method: "GET" })
  .inputValidator((data: AccountTreeDataInput) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    return queryAccountTreeData(data);
  });

export const getAccountsPageData = createServerFn({ method: "GET" })
  .inputValidator((data: AccountsPageDataInput) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    return queryAccountsPageData(data);
  });

export const getAccountReferenceBalances = createServerFn({ method: "GET" })
  .inputValidator((data: AccountReferenceBalancesInput) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    return queryAccountReferenceBalances(data);
  });
