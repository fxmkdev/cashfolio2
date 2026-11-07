import {
  Combobox,
  filterTreeData,
  FocusTrap,
  getTreeExpandedState,
  ScrollArea,
  Title,
  Tooltip,
  TreeSelectOption,
  UnstyledButton,
  useCombobox,
} from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  filterLedgerAccountNode,
  type LedgerAccountSwitcherData,
} from "./account-switcher-data";
import { getLedgerAccountSwitcherOptions } from "./account-switcher-options";
import classes from "./account-switcher.module.css";

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
  const [query, setQuery] = useState("");
  const [expandedState, setExpandedState] = useState<Record<string, boolean>>(
    {},
  );
  const [highlightedValue, setHighlightedValue] = useState<string | null>(null);
  const [activeOptionId, setActiveOptionId] = useState<string>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const optionsId = useId();
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
          : (tree.ancestorsByAccountId.get(account.id) ?? []),
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

  return (
    <Title order={2} aria-label={account.name}>
      <Combobox
        store={combobox}
        onOptionSubmit={activate}
        width="24rem"
        position="bottom-start"
        shadow="md"
        withinPortal
        keepMounted={false}
        transitionProps={{ duration: 150 }}
        returnFocus
        classNames={{ dropdown: classes.dropdown }}
        middlewares={{
          flip: true,
          shift: { padding: 16 },
          size: { padding: 16 },
        }}
        onEnterTransitionEnd={() =>
          optionsRef.current
            ?.querySelector<HTMLElement>('[aria-selected="true"]')
            ?.scrollIntoView({ block: "nearest" })
        }
      >
        <Combobox.Target
          targetType="button"
          withKeyboardNavigation={false}
          withAriaAttributes={false}
        >
          <UnstyledButton
            ref={triggerRef}
            className={classes.trigger}
            aria-label={`Switch Account: ${account.name}`}
            aria-haspopup="listbox"
            aria-expanded={combobox.dropdownOpened}
            aria-controls={combobox.dropdownOpened ? optionsId : undefined}
            onClick={() => combobox.toggleDropdown()}
          >
            <span className={classes.name}>{account.name}</span>
            <IconChevronDown
              size={20}
              className={classes.chevron}
              aria-hidden="true"
            />
          </UnstyledButton>
        </Combobox.Target>
        <Tooltip
          target={triggerRef}
          label="Switch Account"
          disabled={combobox.dropdownOpened}
        />
        <FocusTrap active={combobox.dropdownOpened}>
          <Combobox.Dropdown>
            <Combobox.Search
              aria-label="Search Accounts"
              placeholder="Search Accounts"
              role="combobox"
              aria-expanded={combobox.dropdownOpened}
              aria-controls={optionsId}
              aria-activedescendant={activeOptionId}
              data-autofocus
              value={query}
              withKeyboardNavigation={false}
              onChange={(event) => changeSearch(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  if (event.key === "ArrowDown" && highlightedValue === null) {
                    const first = options.find(({ node }) =>
                      tree.accountIds.has(node.value),
                    );
                    const current =
                      !query.trim() &&
                      options.find(({ node }) => node.value === account.id);
                    setHighlightedValue((current || first)?.node.value ?? null);
                  } else {
                    if (event.key === "ArrowDown") combobox.selectNextOption();
                    else combobox.selectPreviousOption();
                    setHighlightedValue(
                      options[combobox.getSelectedOptionIndex()]?.node.value ??
                        null,
                    );
                  }
                  return;
                }
                const current = options.find(
                  ({ node }) => node.value === highlightedValue,
                );
                if (!current) return;
                if (event.key === "Enter") {
                  event.preventDefault();
                  activate(current.node.value);
                } else if (
                  event.key === "ArrowRight" &&
                  current.hasChildren &&
                  !current.expanded
                ) {
                  event.preventDefault();
                  toggleExpanded(current.node.value);
                } else if (event.key === "ArrowLeft") {
                  if (current.hasChildren && current.expanded) {
                    event.preventDefault();
                    toggleExpanded(current.node.value);
                  } else if (current.parent) {
                    event.preventDefault();
                    setHighlightedValue(current.parent);
                  }
                }
              }}
            />
            <Combobox.Options
              id={optionsId}
              ref={optionsRef}
              aria-label="Accounts"
              className={classes.options}
            >
              <ScrollArea.Autosize
                mah="20rem"
                className={classes.results}
                type="scroll"
                scrollbarSize="var(--combobox-padding)"
                offsetScrollbars="y"
              >
                {options.map((option) => (
                  <TreeSelectOption
                    key={option.node.value}
                    node={option.node}
                    level={option.level}
                    hasChildren={option.hasChildren}
                    expanded={option.expanded}
                    selected={option.node.value === account.id}
                    checked={false}
                    indeterminate={false}
                    showCheckbox={false}
                    isLastChild={option.isLastChild}
                    lineGuides={option.lineGuides}
                    withLines
                    onToggleExpand={toggleExpanded}
                  />
                ))}
              </ScrollArea.Autosize>
              {!options.length && (
                <Combobox.Empty>No accounts found</Combobox.Empty>
              )}
            </Combobox.Options>
          </Combobox.Dropdown>
        </FocusTrap>
      </Combobox>
    </Title>
  );
}
