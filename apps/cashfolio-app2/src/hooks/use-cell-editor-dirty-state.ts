import { useEffect, useState } from "react";

export type CellEditorDirtyContext = {
  onCellEditorDirtyChange?: (isDirty: boolean) => void;
};

export function useCellEditorDirtyState({
  value,
  initialValue,
  context,
}: {
  value: unknown;
  initialValue: unknown;
  context?: CellEditorDirtyContext;
}) {
  const [hasPendingInput, setHasPendingInput] = useState(false);
  const onDirtyChange = context?.onCellEditorDirtyChange;
  const isDirty = hasPendingInput || value !== initialValue;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  // DateInput can retain invalid text without updating its parsed value.
  return setHasPendingInput;
}
