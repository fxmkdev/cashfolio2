import { useForm } from "@mantine/form";
import { useMemo, useState } from "react";
import { currencies } from "@/currencies";
import { useDialogSubmitState } from "@/hooks/use-dialog-submit-state";
import {
  normalizeDateInputValue,
  startOfUtcDay,
  startOfUtcMonth,
} from "@/shared/date";
import { RESOURCE_LIMITS } from "@/shared/resource-limits";

export type NewAccountBookFormValues = {
  name: string;
  referenceCurrency: string | null;
  startDate: Date | string | null;
};

export type NewAccountBookSubmission = {
  name: string;
  referenceCurrency: string;
  startDate: string;
};

function validateStartDate(value: Date | string | null) {
  const startDate = normalizeDateInputValue(value);
  if (!startDate) {
    return value ? "Start date is invalid" : "Start date is required";
  }

  if (startOfUtcDay(startDate) > startOfUtcDay(new Date())) {
    return "Start date cannot be in the future";
  }

  return null;
}

export function useNewAccountBookForm(
  submit: (values: NewAccountBookSubmission) => Promise<void>,
) {
  const { isSubmitting, runSubmit } = useDialogSubmitState();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const currencyOptions = useMemo(
    () =>
      Object.entries(currencies)
        .map(([code, name]) => ({ value: code, label: `${code} – ${name}` }))
        .sort((left, right) => left.value.localeCompare(right.value)),
    [],
  );
  const form = useForm<NewAccountBookFormValues>({
    mode: "controlled",
    initialValues: {
      name: "",
      referenceCurrency: "CHF",
      startDate: startOfUtcMonth(new Date()),
    },
    validate: {
      name: (value) =>
        value.trim().length === 0
          ? "Account book name is required"
          : value.trim().length > RESOURCE_LIMITS.name
            ? "Name cannot exceed 255 characters."
            : null,
      referenceCurrency: (value) =>
        value ? null : "Reference currency is required",
      startDate: validateStartDate,
    },
  });

  const onSubmit = form.onSubmit(async (values) => {
    const normalizedStartDate = normalizeDateInputValue(values.startDate);
    const referenceCurrency = values.referenceCurrency;
    if (!normalizedStartDate || !referenceCurrency) return;

    setSubmitError(null);
    await runSubmit(async () => {
      try {
        await submit({
          name: values.name.trim(),
          referenceCurrency,
          startDate: startOfUtcDay(normalizedStartDate).toISOString(),
        });
      } catch (error) {
        setSubmitError(
          error instanceof Error
            ? error.message
            : "Failed to create account book.",
        );
      }
    });
  });

  return {
    form,
    currencyOptions,
    maxDate: startOfUtcDay(new Date()),
    isSubmitting,
    submitError,
    onSubmit,
  };
}
