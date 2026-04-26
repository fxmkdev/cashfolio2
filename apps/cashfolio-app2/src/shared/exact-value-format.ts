const exactNumberFormatter = new Intl.NumberFormat("en-CH", {
  maximumFractionDigits: 20,
});

const exactFormatterByRoundedFormatter = new WeakMap<
  Intl.NumberFormat,
  Intl.NumberFormat
>();

export function formatExactNumber(value: number): string {
  return exactNumberFormatter.format(value);
}

function buildExactFormatter(formatter: Intl.NumberFormat): Intl.NumberFormat {
  if (typeof formatter.resolvedOptions !== "function") {
    return formatter;
  }

  const options = formatter.resolvedOptions();

  return new Intl.NumberFormat(options.locale, {
    style: options.style,
    currency: options.currency,
    currencyDisplay: options.currencyDisplay,
    currencySign: options.currencySign,
    unit: options.unit,
    unitDisplay: options.unitDisplay,
    notation: options.notation,
    signDisplay: options.signDisplay,
    useGrouping: options.useGrouping,
    numberingSystem: options.numberingSystem,
    minimumFractionDigits: 0,
    maximumFractionDigits: 20,
  });
}

function getExactFormatter(formatter: Intl.NumberFormat): Intl.NumberFormat {
  const cachedFormatter = exactFormatterByRoundedFormatter.get(formatter);
  if (cachedFormatter) {
    return cachedFormatter;
  }

  const exactFormatter = buildExactFormatter(formatter);
  exactFormatterByRoundedFormatter.set(formatter, exactFormatter);
  return exactFormatter;
}

export function formatExactNumberWithFormatter(args: {
  formatter: Intl.NumberFormat;
  value: number;
}): string {
  const formatter = args.formatter;
  if (typeof formatter.resolvedOptions !== "function") {
    return formatter.format(args.value);
  }

  return getExactFormatter(formatter).format(args.value);
}
