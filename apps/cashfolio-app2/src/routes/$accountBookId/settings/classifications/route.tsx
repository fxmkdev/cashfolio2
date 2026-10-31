import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  getAssetClasses,
  saveAssetClass,
  moveAssetClass,
  deleteAssetClass,
} from "@/server/classifications";
import { ClassificationsPageView } from "./-page-view";
import { createDocumentTitleHead } from "@/shared/document-title";
export const Route = createFileRoute(
  "/$accountBookId/settings/classifications",
)({
  loader: ({ params: { accountBookId } }) =>
    getAssetClasses({ data: { accountBookId } }),
  head: () => createDocumentTitleHead("Asset Classes"),
  component: ClassificationsPage,
});
function ClassificationsPage() {
  const nodes = Route.useLoaderData(),
    { accountBookId } = Route.useParams(),
    router = useRouter();
  const refresh = async () => {
    await router.invalidate();
  };
  return (
    <ClassificationsPageView
      nodes={nodes}
      onRefresh={refresh}
      onSave={async (value) => {
        await saveAssetClass({ data: { ...value, accountBookId } });
        await refresh();
      }}
      onMove={async (id, direction) => {
        await moveAssetClass({ data: { accountBookId, id, direction } });
        await refresh();
      }}
      onDelete={async (id, replacementId) => {
        await deleteAssetClass({ data: { accountBookId, id, replacementId } });
        await refresh();
      }}
    />
  );
}
