import { Select, type SelectProps } from "@mantine/core";
import { forwardRef, useMemo } from "react";
import type { AccountBookUnitUsage } from "@/shared/account-book-unit-usage";
import {
  buildCryptocurrencySelectData,
  buildCurrencySelectData,
} from "./unit-select-options";

type CurrencySelectProps = Omit<SelectProps, "data"> & {
  unitUsage?: AccountBookUnitUsage;
  usedCurrencies?: readonly (string | null | undefined)[];
  selectedCurrencies?: readonly (string | null | undefined)[];
  compactLabels?: boolean;
};

type CryptocurrencySelectProps = Omit<SelectProps, "data"> & {
  unitUsage?: AccountBookUnitUsage;
  usedCryptocurrencies?: readonly (string | null | undefined)[];
  selectedCryptocurrencies?: readonly (string | null | undefined)[];
  compactLabels?: boolean;
};

export const CurrencySelect = forwardRef<HTMLInputElement, CurrencySelectProps>(
  function CurrencySelect(
    {
      unitUsage,
      usedCurrencies,
      selectedCurrencies,
      compactLabels,
      searchable = true,
      ...props
    },
    ref,
  ) {
    const data = useMemo(
      () =>
        buildCurrencySelectData({
          unitUsage,
          usedCurrencies,
          selectedCurrencies,
          compactLabels,
        }),
      [compactLabels, selectedCurrencies, unitUsage, usedCurrencies],
    );

    return <Select ref={ref} searchable={searchable} data={data} {...props} />;
  },
);

export const CryptocurrencySelect = forwardRef<
  HTMLInputElement,
  CryptocurrencySelectProps
>(function CryptocurrencySelect(
  {
    unitUsage,
    usedCryptocurrencies,
    selectedCryptocurrencies,
    compactLabels,
    searchable = true,
    ...props
  },
  ref,
) {
  const data = useMemo(
    () =>
      buildCryptocurrencySelectData({
        unitUsage,
        usedCryptocurrencies,
        selectedCryptocurrencies,
        compactLabels,
      }),
    [compactLabels, selectedCryptocurrencies, unitUsage, usedCryptocurrencies],
  );

  return <Select ref={ref} searchable={searchable} data={data} {...props} />;
});
