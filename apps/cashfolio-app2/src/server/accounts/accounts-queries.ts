import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../../prisma.server";
import { AccountType, EquityAccountSubtype } from "../../.prisma-client/enums";
import { ensureAuthorizedForAccountBookId } from "../../account-books/functions.server";
import { createGroupPathSegmentsResolver } from "../accounts/accounts-helpers";
import {
  type AccountReferenceBalancesInput,
  type AccountsPageDataInput,
  type AccountTreeDataInput,
  type LedgerAccountActionDataInput,
  queryActiveAccountBookUnitUsage,
  queryAccountGroups,
  queryAccountReferenceBalances,
  queryAccountsPageData,
  queryAccountTreeData,
  queryExistingNodes,
  queryLedgerAccountActionData,
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
    const resolveGroupPathSegments = createGroupPathSegmentsResolver(allGroups);
    return accounts
      .map((a) => {
        const groupPathSegments = a.groupId
          ? resolveGroupPathSegments(a.groupId)
          : [];

        return {
          ...a,
          groupPath: groupPathSegments.join(" / "),
          groupPathSegments,
        };
      })
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

export const getActiveAccountBookUnitUsage = createServerFn({ method: "GET" })
  .inputValidator((data: { accountBookId: string }) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    return queryActiveAccountBookUnitUsage(data.accountBookId);
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

export const getLedgerAccountActionData = createServerFn({ method: "GET" })
  .inputValidator((data: LedgerAccountActionDataInput) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    return queryLedgerAccountActionData(data);
  });

export const getAccountReferenceBalances = createServerFn({ method: "GET" })
  .inputValidator((data: AccountReferenceBalancesInput) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    return queryAccountReferenceBalances(data);
  });

export const getGainLossEquityAccountId = createServerFn({ method: "GET" })
  .inputValidator((data: { accountBookId: string }) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const account = await prisma.account.findFirst({
      where: {
        accountBookId: data.accountBookId,
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
    });

    return account?.id ?? null;
  });
