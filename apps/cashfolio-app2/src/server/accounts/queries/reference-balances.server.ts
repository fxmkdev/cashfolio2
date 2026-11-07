import type { Unit } from "../../../.prisma-client/enums";
import { toNumericMoney } from "../../money-boundary";
import type { AccountReferenceBalancesInput } from "./types";
import { fetchAccountReferenceBalancesQueryData } from "./tree-data.server";
import { getDisplayBalanceInReferenceCurrencyByAccountId } from "./reference-balance-valuation.server";

export async function queryAccountReferenceBalances(
  data: AccountReferenceBalancesInput,
) {
  const accountState = data.accountState ?? "active";

  const { accounts, rawBalanceByAccountId, referenceCurrency } =
    await fetchAccountReferenceBalancesQueryData({
      accountBookId: data.accountBookId,
      accountState,
      type: data.type,
      equityAccountSubtype: data.equityAccountSubtype,
    });
  const displayBalanceInReferenceCurrencyByAccountId =
    await getDisplayBalanceInReferenceCurrencyByAccountId({
      accounts: accounts.map((account) => ({
        id: account.id,
        type: account.type,
        unit: account.unit as Unit | null,
        currency: account.currency as string | null,
        cryptocurrency: account.cryptocurrency as string | null,
        symbol: account.symbol as string | null,
        tradeCurrency: account.tradeCurrency as string | null,
      })),
      rawBalanceByAccountId,
      referenceCurrency,
      includeReferenceBalances: true,
    });

  return toNumericMoney({
    referenceCurrency,
    rows: accounts.map((account) => ({
      id: account.id,
      balanceInReferenceCurrency:
        displayBalanceInReferenceCurrencyByAccountId.get(account.id) ?? null,
    })),
  });
}
