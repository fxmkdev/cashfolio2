import { useCallback, useEffect, useRef, useState } from "react";
import type { SecuritiesPreference } from "@/shared/securities/contracts";
import { useGlobalLoading } from "../navigation/global-loading";
import type { SecuritiesServices } from "./controller";

/** Serialize writes: cancelling a POST cannot undo an already committed preference. */
export function useExchangePreference(services: SecuritiesServices) {
  const [initial, setInitial] = useState<SecuritiesPreference | null>(null);
  const [reading, setReading] = useState(true);
  const choiceRevision = useRef(0);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const desired = useRef<SecuritiesPreference | null>(null);
  const writing = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  const [readVersion, setReadVersion] = useState(0);
  useEffect(() => {
    const request = new AbortController();
    lifetime.current = request;
    return () => request.abort();
  }, [services]);
  useEffect(() => {
    const request = new AbortController();
    const revision = choiceRevision.current;
    setReading(true);
    setLoadError(false);
    void services
      .preference(request.signal)
      .then((value) => {
        if (!request.signal.aborted && revision === choiceRevision.current)
          setInitial(value);
      })
      .catch(() => {
        if (!request.signal.aborted && revision === choiceRevision.current)
          setLoadError(true);
      })
      .finally(() => {
        if (!request.signal.aborted) setReading(false);
      });
    return () => request.abort();
  }, [services, readVersion]);
  const flush = useCallback(async () => {
    if (writing.current || !desired.current || !lifetime.current) return;
    writing.current = true;
    setSaving(true);
    setSaveError(false);
    const signal = lifetime.current.signal;
    try {
      while (desired.current && !signal.aborted) {
        const next: SecuritiesPreference = desired.current;
        try {
          await services.savePreference(next, signal);
          if (desired.current === next) desired.current = null;
        } catch {
          if (desired.current !== next && !signal.aborted) continue;
          if (!signal.aborted) setSaveError(true);
          break;
        }
      }
    } finally {
      writing.current = false;
      if (!signal.aborted) setSaving(false);
    }
  }, [services]);
  useGlobalLoading(reading || saving);
  return {
    preference: initial,
    preferencePending: !initial && !loadError,
    preferenceLoadError: loadError,
    preferenceSaveError: saveError,
    onRetryPreferenceLoad: () => setReadVersion((value) => value + 1),
    onExchangeChange: (exchange: string | null) => {
      choiceRevision.current++;
      setInitial({ exchange });
      setLoadError(false);
      desired.current = { exchange };
      void flush();
    },
    onRetryPreferenceSave: () => void flush(),
  };
}
