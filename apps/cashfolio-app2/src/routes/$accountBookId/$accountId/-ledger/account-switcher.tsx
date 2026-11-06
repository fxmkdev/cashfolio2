import {
  filterTreeData,
  getTreeExpandedState,
  Popover,
  ScrollArea,
  Text,
  TextInput,
  Title,
  Tooltip,
  Tree,
  UnstyledButton,
  useTree,
} from "@mantine/core";
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
} from "@tabler/icons-react";
import { useMemo, useRef, useState } from "react";
import {
  filterLedgerAccountNode,
  type LedgerAccountSwitcherData,
} from "./account-switcher-data";
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
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedState, setExpandedState] = useState<Record<string, boolean>>(
    {},
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const treeRef = useRef<HTMLUListElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);
  const data = useMemo(
    () => filterTreeData(tree.data, query, filterLedgerAccountNode),
    [tree.data, query],
  );
  const controller = useTree({
    expandedState,
    onExpandedStateChange: setExpandedState,
    selectedState: [account.id],
    multiple: false,
  });

  function changeSearch(nextQuery: string) {
    setQuery(nextQuery);
    setExpandedState(
      getTreeExpandedState(
        filterTreeData(tree.data, nextQuery, filterLedgerAccountNode),
        nextQuery.trim()
          ? "*"
          : (tree.ancestorsByAccountId.get(account.id) ?? []),
      ),
    );
  }

  function changeOpened(nextOpened: boolean) {
    if (nextOpened) changeSearch("");
    setOpened(nextOpened);
  }

  function activate(value: string) {
    if (tree.accountIds.has(value)) {
      setOpened(false);
      if (value !== account.id) onSelectAccount(value);
    } else {
      controller.toggleExpanded(value);
    }
  }

  function activateItem(item: HTMLElement | null) {
    const value = item?.dataset.value;
    if (
      value &&
      (tree.accountIds.has(value) || item.hasAttribute("aria-expanded"))
    ) {
      activate(value);
    }
  }

  return (
    <Title order={2} aria-label={account.name}>
      <Popover
        opened={opened}
        onChange={changeOpened}
        width="24rem"
        position="bottom-start"
        shadow="md"
        withinPortal
        trapFocus
        returnFocus
        classNames={{ dropdown: classes.dropdown }}
        middlewares={{
          flip: true,
          shift: { padding: 16 },
          size: { padding: 16 },
        }}
        onEnterTransitionEnd={() =>
          selectedRef.current?.scrollIntoView({ block: "nearest" })
        }
      >
        <Popover.Target>
          <UnstyledButton
            ref={triggerRef}
            className={classes.trigger}
            aria-label={`Switch Account: ${account.name}`}
            onClick={() => changeOpened(!opened)}
          >
            <span className={classes.name}>{account.name}</span>
            <IconChevronDown
              size={20}
              className={classes.chevron}
              aria-hidden="true"
            />
          </UnstyledButton>
        </Popover.Target>
        <Tooltip target={triggerRef} label="Switch Account" disabled={opened} />
        <Popover.Dropdown>
          <TextInput
            aria-label="Search Accounts"
            placeholder="Search Accounts"
            data-autofocus
            value={query}
            className={classes.search}
            onChange={(event) => changeSearch(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowDown") return;
              const accounts = Array.from(
                treeRef.current?.querySelectorAll<HTMLElement>(
                  '[role="treeitem"]',
                ) ?? [],
              ).filter((element) =>
                tree.accountIds.has(element.dataset.value ?? ""),
              );
              const target =
                (!query.trim() &&
                  accounts.find(
                    (element) => element.dataset.value === account.id,
                  )) ||
                accounts[0];
              if (target) {
                event.preventDefault();
                target.focus();
                target.scrollIntoView({ block: "nearest" });
              }
            }}
          />
          <ScrollArea.Autosize mah="20rem" className={classes.results}>
            {data.length ? (
              <Tree
                ref={treeRef}
                aria-label="Accounts"
                data={data}
                tree={controller}
                expandOnClick={false}
                expandOnSpace={false}
                selectOnClick={false}
                allowRangeSelection={false}
                onClick={(event) => {
                  const item = (
                    event.target as HTMLElement
                  ).closest<HTMLElement>('[role="treeitem"]');
                  event.stopPropagation();
                  item?.focus();
                  activateItem(item);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  const item = (
                    event.target as HTMLElement
                  ).closest<HTMLElement>('[role="treeitem"]');
                  if (item) {
                    event.preventDefault();
                    event.stopPropagation();
                    activateItem(item);
                  }
                }}
                renderNode={({
                  node,
                  selected,
                  hasChildren,
                  expanded,
                  elementProps,
                }) => (
                  <div
                    {...elementProps}
                    ref={selected ? selectedRef : undefined}
                    className={`${elementProps.className} ${classes.nodeLabel}`}
                    onClick={undefined}
                  >
                    <span
                      className={classes.nodeChevron}
                      data-expanded={expanded || undefined}
                    >
                      {hasChildren && (
                        <IconChevronRight size={14} aria-hidden="true" />
                      )}
                    </span>
                    <span className={classes.name}>{node.label}</span>
                    {selected && (
                      <IconCheck
                        size={16}
                        className={classes.chevron}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                )}
              />
            ) : (
              <Text size="sm" c="dimmed" p="xs">
                No accounts found
              </Text>
            )}
          </ScrollArea.Autosize>
        </Popover.Dropdown>
      </Popover>
    </Title>
  );
}
