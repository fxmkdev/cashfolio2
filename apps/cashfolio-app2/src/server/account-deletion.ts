import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import type { AccountDeletionPreview } from "./account-deletion-plan";

export type {
  AccountDeletionAccountBook,
  AccountDeletionPreview,
  DeletionPlan,
  LinkedAccountBook,
} from "./account-deletion-plan";
export { planAccountDeletionFromLinks } from "./account-deletion-plan";

export const getAccountDeletionPreview = createServerFn({
  method: "GET",
}).handler(async (): Promise<AccountDeletionPreview> => {
  const { getAccountDeletionPreview } =
    await import("./account-deletion.server");
  return getAccountDeletionPreview();
});

export const handleAccountDeletionRequest = createServerOnlyFn(
  async (request: Request): Promise<Response> => {
    const { handleAccountDeletionRequest } =
      await import("./account-deletion.server");
    return handleAccountDeletionRequest(request);
  },
);
