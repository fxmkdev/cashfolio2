import { useGlobalLoading } from "@/components/navigation/global-loading";
import { useOrganizer, type OrganizerApi } from "./use-organizer";
import { useOrganizeNavigationGuard } from "./use-organize-navigation-guard";

export function useHierarchyManagement({
  accountBookId,
  page,
  api,
  onSaved,
  refreshMetadata,
}: {
  accountBookId: string;
  page: "categories" | "assetClasses";
  api?: OrganizerApi;
  onSaved: () => void;
  refreshMetadata?: () => Promise<void>;
}) {
  const organizer = useOrganizer(onSaved, api, true, refreshMetadata);
  useGlobalLoading(organizer.loading || organizer.submitState.isRefreshing);
  useOrganizeNavigationGuard(accountBookId, organizer.pending, page);
  return organizer;
}
