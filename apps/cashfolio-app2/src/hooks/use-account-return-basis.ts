import { useSessionStorage } from "@mantine/hooks";
import type { AccountReturnBasis } from "@/shared/accounts/account-returns";

function deserializeBasis(value: string | undefined): AccountReturnBasis {
  try {
    return JSON.parse(value ?? "null") === "cumulative"
      ? "cumulative"
      : "annualized";
  } catch {
    return "annualized";
  }
}

export function useAccountReturnBasis(accountBookId: string) {
  const [basis, setBasis] = useSessionStorage<AccountReturnBasis>({
    key: `cashfolio:returnBasis:${accountBookId}`,
    defaultValue: "annualized",
    deserialize: deserializeBasis,
  });
  return { basis, setBasis };
}
