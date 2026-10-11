import { useCallback, useRef, useState } from "react";

/** Refresh loader-derived constraints without navigating or remounting a draft. */
export function useRefreshedMutationData<T>(source: T, load: () => Promise<T>) {
  const [snapshot, setSnapshot] = useState<{ source: T; value: T } | null>(
    null,
  );
  const loadRef = useRef(load);
  loadRef.current = load;
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const refresh = useCallback(async () => {
    const currentSource = sourceRef.current;
    const value = await loadRef.current();
    if (sourceRef.current === currentSource) {
      setSnapshot({ source: currentSource, value });
    }
  }, []);
  return {
    data: snapshot?.source === source ? snapshot.value : source,
    refresh,
  };
}
