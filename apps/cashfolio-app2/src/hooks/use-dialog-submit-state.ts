import { useCallback, useEffect, useRef, useState } from "react";

export function useDialogSubmitState({
  onSubmittingChange,
}: {
  onSubmittingChange?: (isSubmitting: boolean) => void;
} = {}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const onSubmittingChangeRef = useRef(onSubmittingChange);

  useEffect(() => {
    onSubmittingChangeRef.current = onSubmittingChange;
  }, [onSubmittingChange]);

  const setSubmitting = useCallback((next: boolean) => {
    isSubmittingRef.current = next;
    setIsSubmitting(next);
    onSubmittingChangeRef.current?.(next);
  }, []);

  const runSubmit = useCallback(
    async (submit: () => void | Promise<void>) => {
      if (isSubmittingRef.current) return false;

      setSubmitting(true);
      try {
        await submit();
        return true;
      } finally {
        setSubmitting(false);
      }
    },
    [setSubmitting],
  );

  useEffect(() => {
    return () => {
      if (isSubmittingRef.current) {
        onSubmittingChangeRef.current?.(false);
      }
    };
  }, []);

  return {
    isSubmitting,
    runSubmit,
  };
}
