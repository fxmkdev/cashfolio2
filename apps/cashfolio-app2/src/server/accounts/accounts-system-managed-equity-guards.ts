import { AccountType, EquityAccountSubtype } from "../../.prisma-client/enums";
import {
  getSystemManagedAccountSubtypeMessage,
  getSystemManagedGroupSubtypeMessage,
  isSystemManagedEquitySubtype,
} from "../../shared/system-managed-equity-subtypes";

type EquityNode = {
  type: AccountType;
  equityAccountSubtype?: EquityAccountSubtype | null;
};

export function isSystemManagedEquityNode(node: EquityNode): boolean {
  return (
    node.type === AccountType.EQUITY &&
    isSystemManagedEquitySubtype(node.equityAccountSubtype)
  );
}

export function assertNoSystemManagedAccountSubtype(node: EquityNode): void {
  if (isSystemManagedEquitySubtype(node.equityAccountSubtype)) {
    throw new Error(
      getSystemManagedAccountSubtypeMessage(node.equityAccountSubtype),
    );
  }
}

export function assertNoSystemManagedGroupSubtype(node: EquityNode): void {
  if (isSystemManagedEquitySubtype(node.equityAccountSubtype)) {
    throw new Error(
      getSystemManagedGroupSubtypeMessage(node.equityAccountSubtype),
    );
  }
}
