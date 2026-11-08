import { Unit } from "@/.prisma-client/enums";

export function isReferenceCurrencyUnit(args: {
  unit: Unit | null;
  currency: string | null | undefined;
  referenceCurrency: string | null | undefined;
}): boolean {
  return (
    args.unit === Unit.CURRENCY &&
    !!args.currency &&
    !!args.referenceCurrency &&
    args.currency.toUpperCase() === args.referenceCurrency.toUpperCase()
  );
}
