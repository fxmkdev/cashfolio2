import { notifications } from "@mantine/notifications";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { IconCheck } from "@tabler/icons-react";
import { useMemo } from "react";
import { invalidateCachedUserAccountBooks } from "@/account-books/options";
import { createDocumentTitleHead } from "@/shared/document-title";
import { UserLocaleProvider, useUserLocale } from "@/user-locale-context";
import {
  NewAccountBookPageActions,
  resolveNewAccountBookReturnTarget,
} from "./-new-account-book-page-actions";
import { NewAccountBookPageView } from "./-new-account-book-page-view";
import { useNewAccountBookForm } from "./-use-new-account-book-form";

export const Route = createFileRoute("/account-books/new")({
  validateSearch: parseNewAccountBookSearch,
  loader: async () => {
    const [
      { getUserAccountBooks },
      { getAuthenticatedUserLocale, getAuthenticatedUserProfile },
    ] = await Promise.all([
      import("@/server/home"),
      import("@/server/user-profile"),
    ]);

    const [accountBooks, userProfile, userLocale] = await Promise.all([
      getUserAccountBooks(),
      getAuthenticatedUserProfile(),
      getAuthenticatedUserLocale(),
    ]);

    return { accountBooks, userProfile, userLocale };
  },
  head: () => createDocumentTitleHead("Create Account Book"),
  component: NewAccountBookPage,
});

export type NewAccountBookSearch = {
  returnTo?: string;
};

export function parseNewAccountBookSearch(
  search: Record<string, unknown>,
): NewAccountBookSearch {
  return typeof search.returnTo === "string" && search.returnTo.length > 0
    ? { returnTo: search.returnTo }
    : {};
}

function showAccountBookCreatedNotification() {
  notifications.show({
    color: "green",
    icon: <IconCheck size={16} />,
    title: "Created",
    message: "Account book created.",
    withBorder: true,
  });
}

function NewAccountBookPage() {
  const { accountBooks, userProfile, userLocale } = Route.useLoaderData();
  return (
    <UserLocaleProvider locale={userLocale}>
      <NewAccountBookPageContent
        accountBooks={accountBooks}
        userProfile={userProfile}
      />
    </UserLocaleProvider>
  );
}

function NewAccountBookPageContent({
  accountBooks,
  userProfile,
}: Pick<
  ReturnType<typeof Route.useLoaderData>,
  "accountBooks" | "userProfile"
>) {
  const { returnTo } = Route.useSearch();
  const userLocale = useUserLocale();
  const navigate = useNavigate({ from: "/account-books/new" });
  const returnTarget = useMemo(
    () => resolveNewAccountBookReturnTarget({ accountBooks, returnTo }),
    [accountBooks, returnTo],
  );
  const formController = useNewAccountBookForm(async (values) => {
    const { createAccountBook } = await import("@/server/account-books");
    const created = await createAccountBook({ data: values });

    invalidateCachedUserAccountBooks();
    showAccountBookCreatedNotification();
    await navigate({
      to: "/$accountBookId/accounts",
      params: { accountBookId: created.id },
      search: { tab: "BALANCE", mode: "active" },
    });
  });

  return (
    <NewAccountBookPageView
      {...formController}
      userLocale={userLocale}
      actions={
        <NewAccountBookPageActions
          returnTarget={returnTarget}
          userProfile={userProfile}
        />
      }
    />
  );
}
