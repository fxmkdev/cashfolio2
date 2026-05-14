import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import {
  deleteAccountBook,
  updateAccountBookSettings,
} from "@/server/account-books";
import { invalidateCachedUserAccountBooks } from "../-account-book-options-loader";
import { loadAccountBookSettingsPageData } from "./-page-loader";

const AccountBookSettingsPageView = lazy(async () => {
  const module = await import("./-page-view");
  return { default: module.AccountBookSettingsPageView };
});

export const Route = createFileRoute("/$accountBookId/account-book-settings")({
  loader: async ({ params: { accountBookId } }) => {
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
