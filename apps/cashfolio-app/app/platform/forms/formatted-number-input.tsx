import { useMemo, useState, type ComponentPropsWithoutRef } from "react";
import invariant from "tiny-invariant";
import { NumberInput } from "@mantine/core";

export type FormattedNumberInputProps = ComponentPropsWithoutRef<
  typeof NumberInput
> & {
  locale?: string;
};

export function FormattedNumberInput({
  name,
  value,
  defaultValue,
  locale = "en-US",
  ...props
}: FormattedNumberInputProps) {
  const [internalValue, setInternalValue] = useState<number | undefined>(
    defaultValue != null ? Number(defaultValue) : undefined,
  );

  const { thousandSeparator, decimalSeparator } = useMemo(
    () => getNumberFormatSymbols(locale),
    [locale],
  );

  return (
    <>
      <NumberInput
        {...props}
        valueIsNumericString={true}
        value={value ?? undefined}
        defaultValue={defaultValue ?? undefined}
        onValueChange={(values, sourceInfo) => {
          setInternalValue(values.floatValue);
          props.onValueChange?.(values, sourceInfo);
        }}
        thousandSeparator={thousandSeparator}
        decimalSeparator={decimalSeparator}
        inputMode="decimal"
      />
      <input name={name} value={value ?? internalValue ?? ""} type="hidden" />
    </>
  );
}

function getNumberFormatSymbols(locale: string) {
  const numberFormat = new Intl.NumberFormat(locale);

  const thousandSeparator = numberFormat
    .formatToParts(10_000)
    .find((x) => x.type === "group")?.value;
  const decimalSeparator = numberFormat
    .formatToParts(1.1)
    .find((x) => x.type === "decimal")?.value;

  invariant(
    decimalSeparator,
    `decimalSeparator not found for locale ${locale}`,
  );

  return { thousandSeparator, decimalSeparator };
}
