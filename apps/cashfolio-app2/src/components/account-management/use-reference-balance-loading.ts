import { useEffect, useState } from "react";
import { REFERENCE_BALANCES_LOADING_DELAY_MS } from "./reference-balance-loading";

export function useReferenceBalanceLoading(loading: boolean) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!loading) {
      setVisible(false);
      return;
    }
    const timeoutId = window.setTimeout(
      () => setVisible(true),
      REFERENCE_BALANCES_LOADING_DELAY_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [loading]);
  return loading && visible;
}
