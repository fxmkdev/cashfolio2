import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { updateAccountBookSettings } from "@/server/account-books";
import { invalidateCachedUserAccountBooks } from "../-account-book-options-loader";
import { loadAccountBookSettingsPageData } from "./-page-loader";

const AccountBookSettingsPageView = lazy(async () => {
  const module = await import("./-page-view");
  return { default: module.AccountBookSettingsPageView };
});

export const Route = createFileRoute("/$accountBookId/settings")({
  loader: async ({ params: { accountBookId } }) => {
    return loadAccountBookSettingsPageData({ accountBookId });
  },
  component: AccountBookSettingsPage,
});

function AccountBookSettingsPage() {
  const settings = Route.useLoaderData();
  const { accountBookId } = Route.useParams();
  const router = useRouter();

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
      />
    </Suspense>
  );
}
