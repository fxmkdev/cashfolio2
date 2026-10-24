import type { EquityAccountSubtype } from "../.prisma-client/enums";
export type TabValue = "BALANCE" | `EQUITY-${EquityAccountSubtype}`;
