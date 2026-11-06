import { filterTreeData, TreeSelect } from "@mantine/core";
import { useMemo, useState } from "react";
import {
  filterLedgerAccountNode,
  type LedgerAccountSwitcherData,
} from "./account-switcher-data";

export type LedgerAccountSwitcherProps = {
  account: { id: string; name: string };
  tree: LedgerAccountSwitcherData;
  onSelectAccount: (accountId: string) => void;
};

export function LedgerAccountSwitcher({
  account,
  tree,
  onSelectAccount,
}: LedgerAccountSwitcherProps) {
  const [searchValue, setSearchValue] = useState(account.name);
  const [expandedValues, setExpandedValues] = useState<string[]>([]);
  // TreeSelect skips filtering and search expansion when the query equals the
  // selected label. Still filter that explicit query and reveal every match.
  const selectedNameSearch = searchValue === account.name;
  const data = useMemo(
    () =>
      selectedNameSearch
        ? filterTreeData(tree.data, searchValue, filterLedgerAccountNode)
        : tree.data,
    [searchValue, selectedNameSearch, tree],
  );

  return (
    <TreeSelect
      aria-label="Switch Account"
      placeholder="Switch Account"
      w={240}
      maw="100%"
      data={data}
      value={account.id}
      searchable
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      filter={filterLedgerAccountNode}
      allowDeselect={false}
      clearable={false}
      // Navigation commits the new account. Keep this ledger's display value
      // until then so restoring it with browser Back cannot retain the target.
      clearSearchOnChange={false}
      expandOnClick
      expandedValues={
        selectedNameSearch
          ? [...new Set([...tree.ancestorsByAccountId.values()].flat())]
          : expandedValues
      }
      onExpandedChange={setExpandedValues}
      onDropdownOpen={() => {
        setSearchValue("");
        setExpandedValues(tree.ancestorsByAccountId.get(account.id) ?? []);
      }}
      onDropdownClose={() => setSearchValue(account.name)}
      onChange={(value) => {
        if (value && value !== account.id && tree.accountIds.has(value)) {
          onSelectAccount(value);
        }
      }}
      nothingFoundMessage="No accounts found"
      comboboxProps={{ withinPortal: true }}
    />
  );
}
