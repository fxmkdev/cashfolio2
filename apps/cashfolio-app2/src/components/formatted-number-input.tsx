import { useMemo, type ComponentPropsWithRef } from "react";
import { NumberInput } from "@mantine/core";

export type FormattedNumberInputProps = ComponentPropsWithRef<
  typeof NumberInput
> & {
  locale?: string;
};

export function FormattedNumberInput({
  locale = "en-US",
  ...props
}: FormattedNumberInputProps) {
  const { thousandSeparator, decimalSeparator } = useMemo(
    () => getNumberFormatSymbols(locale),
    [locale],
  );

  return (
    <NumberInput
      {...props}
      valueIsNumericString={true}
      thousandSeparator={thousandSeparator}
      decimalSeparator={decimalSeparator}
      inputMode="decimal"
    />
  );
}

export function getNumberFormatSymbols(locale: string) {
  const numberFormat = new Intl.NumberFormat(locale);

  const thousandSeparator = numberFormat
    .formatToParts(10_000)
    .find((x) => x.type === "group")?.value;
  const decimalSeparator = numberFormat
    .formatToParts(1.1)
    .find((x) => x.type === "decimal")?.value;

  if (!decimalSeparator) {
    throw new Error(`decimalSeparator not found for locale ${locale}`);
  }

  return { thousandSeparator, decimalSeparator };
}
