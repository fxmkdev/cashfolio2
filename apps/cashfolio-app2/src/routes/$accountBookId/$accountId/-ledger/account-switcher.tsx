import {
  Combobox,
  FocusTrap,
  ScrollArea,
  Title,
  Tooltip,
  TreeSelectOption,
  UnstyledButton,
} from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import { useRef } from "react";
import {
  useAccountSwitcher,
  type LedgerAccountSwitcherProps,
} from "./use-account-switcher";
import classes from "./account-switcher.module.css";

export type { LedgerAccountSwitcherProps } from "./use-account-switcher";

export function LedgerAccountSwitcher({
  account,
  tree,
  onSelectAccount,
}: LedgerAccountSwitcherProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const switcher = useAccountSwitcher({ account, tree, onSelectAccount });
  const {
    query,
    combobox,
    options,
    optionsId,
    optionsRef,
    activeOptionId,
    changeSearch,
    toggleExpanded,
    activate,
  } = switcher;

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
        onEnterTransitionEnd={switcher.revealOpeningAccount}
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
              onKeyDown={switcher.onKeyDown}
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
