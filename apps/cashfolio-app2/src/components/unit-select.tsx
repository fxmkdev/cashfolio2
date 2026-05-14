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
  selectedCurrency?: string | null;
  selectedCurrencies?: readonly (string | null | undefined)[];
  compactLabels?: boolean;
};

type CryptocurrencySelectProps = Omit<SelectProps, "data"> & {
  unitUsage?: AccountBookUnitUsage;
  usedCryptocurrencies?: readonly (string | null | undefined)[];
  selectedCryptocurrency?: string | null;
  selectedCryptocurrencies?: readonly (string | null | undefined)[];
  compactLabels?: boolean;
};

export const CurrencySelect = forwardRef<HTMLInputElement, CurrencySelectProps>(
  function CurrencySelect(
    {
      unitUsage,
      usedCurrencies,
      selectedCurrency,
      selectedCurrencies,
      compactLabels = true,
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
          selectedCurrencies:
            selectedCurrencies ??
            (selectedCurrency === undefined ? undefined : [selectedCurrency]),
          compactLabels,
        }),
      [
        compactLabels,
        selectedCurrencies,
        selectedCurrency,
        unitUsage,
        usedCurrencies,
      ],
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
    selectedCryptocurrency,
    selectedCryptocurrencies,
    compactLabels = true,
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
        selectedCryptocurrencies:
          selectedCryptocurrencies ??
          (selectedCryptocurrency === undefined
            ? undefined
            : [selectedCryptocurrency]),
        compactLabels,
      }),
    [
      compactLabels,
      selectedCryptocurrencies,
      selectedCryptocurrency,
      unitUsage,
      usedCryptocurrencies,
    ],
  );

  return <Select ref={ref} searchable={searchable} data={data} {...props} />;
});
