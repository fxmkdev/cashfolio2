import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { invalidateCachedUserAccountBooks } from "../-account-book-options-loader";

const AccountBookSettingsPageView = lazy(async () => {
  const module = await import("./-page-view");
  return { default: module.AccountBookSettingsPageView };
});

export const Route = createFileRoute("/$accountBookId/account-book-settings")({
  loader: async ({ params: { accountBookId } }) => {
    const { loadAccountBookSettingsPageData } = await import("./-page-loader");
    return loadAccountBookSettingsPageData({ accountBookId });
  },
  component: AccountBookSettingsPage,
});

function AccountBookSettingsPage() {
  const settings = Route.useLoaderData();
  const { accountBookId } = Route.useParams();
  const router = useRouter();
  const navigate = useNavigate({
    from: "/$accountBookId/account-book-settings",
  });

  return (
    <Suspense fallback={null}>
      <AccountBookSettingsPageView
        accountBookId={accountBookId}
        settings={settings}
        onSubmit={async (values) => {
          const { updateAccountBookSettings } =
            await import("@/server/account-books");

          await updateAccountBookSettings({
            data: {
              accountBookId,
              name: values.name,
              referenceCurrency: values.referenceCurrency,
              startDate: values.startDate,
            },
          });

          invalidateCachedUserAccountBooks();
          await router.invalidate();
        }}
        onDelete={async (values) => {
          const { deleteAccountBook } = await import("@/server/account-books");

          await deleteAccountBook({
            data: {
              accountBookId,
              confirmationName: values.confirmationName,
            },
          });

          invalidateCachedUserAccountBooks();
          await navigate({ to: "/" });
        }}
      />
    </Suspense>
  );
}
