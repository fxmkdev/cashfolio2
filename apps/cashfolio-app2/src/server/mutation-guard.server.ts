import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import { ensureSameOriginRequestFromServerContext } from "../security/same-origin.server";

export async function ensureAuthorizedAccountBookMutation(
  accountBookId: string,
) {
  ensureSameOriginRequestFromServerContext();
  await ensureAuthorizedForAccountBookId(accountBookId);
}
