import {
  bindResourceUser,
  startReadBudget,
  withResourceRequest,
} from "../resource-context.server";

export function withUserResourceRequest(
  userId: string,
  operation: () => Promise<void>,
  signal = new AbortController().signal,
) {
  return withResourceRequest(signal, async () => {
    bindResourceUser(userId);
    startReadBudget();
    await operation();
    return new Response();
  });
}
