import {
  TreeSelect,
  type TreeNodeData,
  type TreeSelectProps,
} from "@mantine/core";
import { forwardRef, useMemo } from "react";

export const ACCOUNT_TREE_GROUP_VALUE_PREFIX =
  "__cashfolio_account_tree_group__:";

export type AccountTreeOption = {
  value: string;
  label: string;
  treePath?: string[];
  treeLabel?: string;
};

export type AccountTreeSelectProps = Omit<
  TreeSelectProps,
  "data" | "filter" | "mode" | "onChange"
> & {
  accounts: AccountTreeOption[];
  onChange: (value: string | null) => void;
};

function encodeGroupPath(path: string[]): string {
  return path.map((segment) => encodeURIComponent(segment)).join("/");
}

function createGroupValue(path: string[]): string {
  return `${ACCOUNT_TREE_GROUP_VALUE_PREFIX}${encodeGroupPath(path)}`;
}

function createSearchLabel(option: AccountTreeOption): string {
  if (option.treePath?.length) {
    return [...option.treePath, option.treeLabel ?? option.label].join(" / ");
  }

  return option.label;
}

export function getAccountTreeSearchLabel(node: TreeNodeData): string {
  return typeof node.nodeProps?.searchLabel === "string"
    ? node.nodeProps.searchLabel
    : String(node.label);
}

export function buildAccountTreeData(
  options: AccountTreeOption[],
): TreeNodeData[] {
  const roots: TreeNodeData[] = [];
  const nodeByGroupValue = new Map<string, TreeNodeData>();

  function getGroupNode(path: string[]): TreeNodeData {
    const value = createGroupValue(path);
    const existingNode = nodeByGroupValue.get(value);
    if (existingNode) return existingNode;

    const node: TreeNodeData = {
      value,
      label: path.at(-1) ?? "",
      nodeProps: {
        searchLabel: path.join(" / "),
      },
    };

    nodeByGroupValue.set(value, node);

    const parentPath = path.slice(0, -1);
    if (parentPath.length === 0) {
      roots.push(node);
    } else {
      const parentNode = getGroupNode(parentPath);
      parentNode.children = parentNode.children ?? [];
      parentNode.children.push(node);
    }

    return node;
  }

  for (const option of options) {
    const leafNode: TreeNodeData = {
      value: option.value,
      label: option.treeLabel ?? option.label,
      nodeProps: {
        searchLabel: createSearchLabel(option),
      },
    };

    if (!option.treePath?.length) {
      roots.push(leafNode);
      continue;
    }

    const parentNode = getGroupNode(option.treePath);
    parentNode.children = parentNode.children ?? [];
    parentNode.children.push(leafNode);
  }

  return roots;
}

export function isAccountTreeSelectableValue(
  value: string | null,
  options: AccountTreeOption[],
): boolean {
  return value === null || options.some((option) => option.value === value);
}

export const AccountTreeSelect = forwardRef<
  HTMLInputElement,
  AccountTreeSelectProps
>(function AccountTreeSelect(
  {
    accounts,
    comboboxProps,
    nothingFoundMessage = "Nothing found",
    searchable = true,
    allowDeselect = false,
    expandOnClick = true,
    defaultExpandAll = true,
    onChange,
    ...props
  },
  ref,
) {
  const data = useMemo(() => buildAccountTreeData(accounts), [accounts]);
  const accountValues = useMemo(
    () => new Set(accounts.map((account) => account.value)),
    [accounts],
  );

  return (
    <TreeSelect
      ref={ref}
      {...props}
      data={data}
      searchable={searchable}
      allowDeselect={allowDeselect}
      expandOnClick={expandOnClick}
      defaultExpandAll={defaultExpandAll}
      comboboxProps={{ withinPortal: false, ...comboboxProps }}
      nothingFoundMessage={nothingFoundMessage}
      filter={(query, node) =>
        getAccountTreeSearchLabel(node)
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      }
      onChange={(nextValue) => {
        if (nextValue === null || accountValues.has(nextValue)) {
          onChange(nextValue);
        }
      }}
    />
  );
});
