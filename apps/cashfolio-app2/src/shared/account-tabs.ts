import type { EquityAccountSubtype } from "../.prisma-client/enums";

export type TabValue = "ASSET" | "LIABILITY" | `EQUITY-${EquityAccountSubtype}`;
