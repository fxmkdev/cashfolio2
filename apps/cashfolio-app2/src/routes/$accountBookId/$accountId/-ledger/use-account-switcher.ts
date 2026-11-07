import {
  filterTreeData,
  getTreeExpandedState,
  useCombobox,
} from "@mantine/core";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  filterLedgerAccountNode,
  type LedgerAccountSwitcherData,
} from "./account-switcher-data";
import { handleAccountSwitcherKeyDown } from "./account-switcher-keyboard";
import { getLedgerAccountSwitcherOptions } from "./account-switcher-options";

export type LedgerAccountSwitcherProps = {
  account: { id: string; name: string };
  tree: LedgerAccountSwitcherData;
  onSelectAccount: (accountId: string) => void;
};

export function useAccountSwitcher({
  account,
  tree,
  onSelectAccount,
}: LedgerAccountSwitcherProps) {
  const [query, setQuery] = useState("");
  const [expandedState, setExpandedState] = useState<Record<string, boolean>>(
    {},
  );
  const [highlightedValue, setHighlightedValue] = useState<string | null>(null);
  const [activeOptionId, setActiveOptionId] = useState<string>();
  const optionsRef = useRef<HTMLDivElement>(null);
  const optionsId = useId();
  const openingAccountId = useMemo(
    () =>
      tree.accountIds.has(account.id)
        ? account.id
        : getLedgerAccountSwitcherOptions(
            tree.data,
            getTreeExpandedState(tree.data, "*"),
          ).find(({ node }) => tree.accountIds.has(node.value))?.node.value,
    [account.id, tree],
  );
  const data = useMemo(
    () => filterTreeData(tree.data, query, filterLedgerAccountNode),
    [tree.data, query],
  );
  const options = useMemo(
    () => getLedgerAccountSwitcherOptions(data, expandedState),
    [data, expandedState],
  );
  const combobox = useCombobox({
    onDropdownOpen: () => changeSearch(""),
    onDropdownClose: () => {
      setHighlightedValue(null);
      combobox.resetSelectedOption();
    },
  });
  const { selectOption, resetSelectedOption } = combobox;

  // Preserve the highlighted value when expanding a branch changes row indexes.
  useEffect(() => {
    const index = options.findIndex(
      ({ node }) => node.value === highlightedValue,
    );
    if (index < 0) {
      resetSelectedOption();
      setActiveOptionId(undefined);
      if (highlightedValue !== null) setHighlightedValue(null);
      return;
    }
    selectOption(index);
    setActiveOptionId(
      optionsRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[
        index
      ]?.id,
    );
  }, [options, highlightedValue, selectOption, resetSelectedOption]);

  function changeSearch(nextQuery: string) {
    setQuery(nextQuery);
    setHighlightedValue(null);
    combobox.resetSelectedOption();
    setExpandedState(
      getTreeExpandedState(
        filterTreeData(tree.data, nextQuery, filterLedgerAccountNode),
        nextQuery.trim()
          ? "*"
          : (tree.ancestorsByAccountId.get(openingAccountId ?? "") ?? []),
      ),
    );
  }

  function toggleExpanded(value: string) {
    setExpandedState((previous) => ({
      ...previous,
      [value]: !previous[value],
    }));
  }

  function activate(value: string) {
    if (tree.accountIds.has(value)) {
      combobox.closeDropdown();
      if (value !== account.id) onSelectAccount(value);
    } else if (
      options.some(
        (option) => option.node.value === value && option.hasChildren,
      )
    ) {
      toggleExpanded(value);
    }
  }

  function revealOpeningAccount() {
    const index = options.findIndex(
      ({ node }) => node.value === openingAccountId,
    );
    const rows =
      optionsRef.current?.querySelectorAll<HTMLElement>('[role="option"]');
    rows?.[index]?.scrollIntoView({ block: "nearest" });
  }

  return {
    query,
    combobox,
    options,
    optionsId,
    optionsRef,
    activeOptionId,
    changeSearch,
    toggleExpanded,
    activate,
    revealOpeningAccount,
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) =>
      handleAccountSwitcherKeyDown(event, {
        accountId: account.id,
        accountIds: tree.accountIds,
        query,
        options,
        highlightedValue,
        setHighlightedValue,
        combobox,
        activate,
        toggleExpanded,
      }),
  };
}
