import { useCallback, useState } from "react";

/** Scope dialog state to its chart context, including changes away and back. */
export function useAllocationOtherDetails(context: string) {
  const [details, setDetails] = useState({ context, opened: false });
  // Reset synchronously so an earlier context cannot reopen stale details.
  if (details.context !== context) setDetails({ context, opened: false });
  const open = useCallback(
    () => setDetails({ context, opened: true }),
    [context],
  );
  const close = useCallback(
    () => setDetails({ context, opened: false }),
    [context],
  );
  return { opened: details.context === context && details.opened, open, close };
}
