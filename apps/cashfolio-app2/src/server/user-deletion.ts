import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import type { UserDeletionPreview } from "./user-deletion-plan";

export type {
  UserDeletionAccountBook,
  UserDeletionPreview,
  DeletionPlan,
  LinkedAccountBook,
} from "./user-deletion-plan";
export { planUserDeletionFromLinks } from "./user-deletion-plan";

export const getUserDeletionPreview = createServerFn({
  method: "GET",
}).handler(async (): Promise<UserDeletionPreview> => {
  const { getUserDeletionPreview } = await import("./user-deletion.server");
  return getUserDeletionPreview();
});

export const handleUserDeletionRequest = createServerOnlyFn(
  async (request: Request): Promise<Response> => {
    const { handleUserDeletionRequest } =
      await import("./user-deletion.server");
    return handleUserDeletionRequest(request);
  },
);
