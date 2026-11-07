import {
  readAccountBookInput,
  readAccountInput,
} from "../read-input-validation";
import {
  readAccountSelectorsInput,
  readAccountsScopeInput,
  readAccountTreeInput,
} from "./queries/input";
import { startReadBudget } from "../resource-context.server";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../../prisma.server";
import { AccountType, EquityAccountSubtype } from "../../.prisma-client/enums";
import { ensureAuthorizedForAccountBookId } from "../../account-books/functions.server";
import { createGroupPathSegmentsResolver } from "./hierarchy/groups.server";
import { queryAccountGroups, queryExistingNodes } from "./queries/selectors.server";
import { queryActiveAccountBookUnitUsage } from "./queries/unit-usage.server";
import { queryAccountTreeData } from "./queries/tree.server";
import { queryLedgerAccountActionData } from "./queries/ledger-actions.server";
import { queryAccountReferenceBalances } from "./queries/reference-balances.server";
import { queryAccountsPageData } from "./queries/page.server";

export const getAccounts = createServerFn({ method: "GET" })
  .validator(readAccountBookInput)
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

export const getAccountNavigationGroups = createServerFn({ method: "GET" })
  .validator((data: { accountBookId: string }) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    return prisma.accountGroup.findMany({
      where: { accountBookId: data.accountBookId, type: AccountType.BALANCE },
      select: {
        id: true,
        name: true,
        parentGroupId: true,
        isActive: true,
        sortOrder: true,
      },
    });
  });

export const getAccountGroups = createServerFn({ method: "GET" })
  .validator(readAccountSelectorsInput)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    return queryAccountGroups(data.accountBookId, data.accountState);
  });

export const getExistingNodes = createServerFn({ method: "GET" })
  .validator(readAccountSelectorsInput)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    return queryExistingNodes(data.accountBookId, data.accountState);
  });

export const getActiveAccountBookUnitUsage = createServerFn({ method: "GET" })
  .validator(readAccountBookInput)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    return queryActiveAccountBookUnitUsage(data.accountBookId);
  });

export const getAccountTreeData = createServerFn({ method: "GET" })
  .validator(readAccountTreeInput)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    startReadBudget();
    return queryAccountTreeData(data);
  });

export const getAccountsPageData = createServerFn({ method: "GET" })
  .validator(readAccountsScopeInput)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    startReadBudget();
    return queryAccountsPageData(data);
  });

export const getLedgerAccountActionData = createServerFn({ method: "GET" })
  .validator(readAccountInput)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    startReadBudget();
    return queryLedgerAccountActionData(data);
  });

export const getAccountReferenceBalances = createServerFn({ method: "GET" })
  .validator(readAccountsScopeInput)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    startReadBudget();
    return queryAccountReferenceBalances(data);
  });

export const getGainLossEquityAccountId = createServerFn({ method: "GET" })
  .validator(readAccountBookInput)
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
