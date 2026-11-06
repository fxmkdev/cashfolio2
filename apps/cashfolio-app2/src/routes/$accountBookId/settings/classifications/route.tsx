import { useMemo } from "react";
import type { OrganizerApi } from "@/components/hierarchy-organize/use-organizer";
import {
  getAssetClassOrganizeData,
  moveAssetClassTreeItems,
} from "@/server/asset-class-organize";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  getAssetClasses,
  saveAssetClass,
  deleteAssetClass,
} from "@/server/classifications";
import { ClassificationsPageView } from "./-page-view";
import { createDocumentTitleHead } from "@/shared/document-title";
export const Route = createFileRoute(
  "/$accountBookId/settings/classifications",
)({
  validateSearch: (search: Record<string, unknown>) =>
    search.organize === true ? { organize: true as const } : {},
  loader: ({ params: { accountBookId } }) =>
    getAssetClasses({ data: { accountBookId } }),
  head: () => createDocumentTitleHead("Asset Classes"),
  component: ClassificationsPage,
});
function ClassificationsPage() {
  const nodes = Route.useLoaderData(),
    { accountBookId } = Route.useParams(),
    router = useRouter();
  const { organize } = Route.useSearch();
  const organizerApi = useMemo<OrganizerApi>(
    () => ({
      kind: "assetClasses",
      load: () => getAssetClassOrganizeData({ data: { accountBookId } }),
      move: (move, version) =>
        moveAssetClassTreeItems({
          data: {
            accountBookId,
            ...move,
            version,
            items: move.items.map((item) => {
              if (item.nodeType !== "assetClass")
                throw new Error("Choose an asset class.");
              return { ...item, nodeType: item.nodeType };
            }),
          },
        }),
      delete: (target, replacementId) => {
        if (replacementId === undefined)
          throw new Error("Choose a replacement class or Unclassified.");
        return deleteAssetClass({
          data: { accountBookId, id: target.id, replacementId },
        });
      },
    }),
    [accountBookId],
  );
  const refresh = async () => {
    await router.invalidate();
  };
  return (
    <ClassificationsPageView
      accountBookId={accountBookId}
      organize={organize}
      organizerApi={organizerApi}
      nodes={nodes}
      onRefresh={refresh}
      onSave={async (value) => {
        await saveAssetClass({ data: { ...value, accountBookId } });
        await refresh();
      }}
      onDelete={async (id, replacementId) => {
        await deleteAssetClass({ data: { accountBookId, id, replacementId } });
        await refresh();
      }}
    />
  );
}
