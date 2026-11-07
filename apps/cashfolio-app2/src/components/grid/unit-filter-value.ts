import { Unit } from "@/.prisma-client/enums";

/** Raw identifiers remain filterable even when the cell hides reference currency. */
export function getUnitFilterValue(
  data:
    | {
        unit: Unit | null;
        currency: string | null;
        cryptocurrency: string | null;
        symbol: string | null;
      }
    | undefined,
): string | null {
  switch (data?.unit) {
    case Unit.CURRENCY:
      return data.currency;
    case Unit.CRYPTOCURRENCY:
      return data.cryptocurrency;
    case Unit.SECURITY:
      return data.symbol;
    default:
      return null;
  }
}
