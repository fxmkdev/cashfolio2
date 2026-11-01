import {
  TreeSelect,
  type TreeNodeData,
  type TreeSelectProps,
} from "@mantine/core";
import { forwardRef, useRef } from "react";

export type GroupTreeOption = {
  value: string;
  label: string;
  parentGroupId?: string | null;
  isCashAccount?: boolean;
  treePath?: string[];
  treeLabel?: string;
};

export type GroupTreeSelectProps = Omit<
  TreeSelectProps,
  "data" | "filter" | "mode" | "onChange"
> & {
  groups: GroupTreeOption[];
  onChange: (value: string | null) => void;
};

function splitPath(label: string): string[] {
  return label
    .split(" / ")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function createPath(option: GroupTreeOption): string[] {
  if (option.treeLabel) {
    return [...(option.treePath ?? []), option.treeLabel];
  }

  if (option.treePath?.length) {
    return [...option.treePath, option.treeLabel ?? option.label];
  }

  const labelPath = splitPath(option.label);
  return labelPath.length > 0 ? labelPath : [option.label];
}

function createSearchLabel(option: GroupTreeOption): string {
  return createPath(option).join(" / ");
}

export function getGroupTreeSearchLabel(node: TreeNodeData): string {
  return typeof node.nodeProps?.searchLabel === "string"
    ? node.nodeProps.searchLabel
    : String(node.label);
}

export function buildGroupTreeData(options: GroupTreeOption[]): TreeNodeData[] {
  const roots: TreeNodeData[] = [];
  const nodeByValue = new Map<string, TreeNodeData>();
  const valueByPath = new Map<string, string>();

  for (const option of options) {
    const path = createPath(option);
    nodeByValue.set(option.value, {
      value: option.value,
      label: option.treeLabel ?? path.at(-1) ?? option.label,
      nodeProps: {
        searchLabel: createSearchLabel(option),
      },
    });
    valueByPath.set(path.join("\0"), option.value);
  }

  for (const option of options) {
    const node = nodeByValue.get(option.value);
    if (!node) continue;

    const path = createPath(option);
    const parentValue =
      option.parentGroupId && nodeByValue.has(option.parentGroupId)
        ? option.parentGroupId
        : valueByPath.get(path.slice(0, -1).join("\0"));
    const parentNode =
      parentValue && parentValue !== option.value
        ? nodeByValue.get(parentValue)
        : undefined;

    if (parentNode) {
      parentNode.children = parentNode.children ?? [];
      parentNode.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export const GroupTreeSelect = forwardRef<
  HTMLInputElement,
  GroupTreeSelectProps
>(function GroupTreeSelect(
  {
    groups,
    comboboxProps,
    placeholder = "Top Level",
    nothingFoundMessage = "Nothing found",
    searchable = true,
    allowDeselect = false,
    onChange,
    ...props
  },
  ref,
) {
  const previousGroups = useRef(new Map<string, GroupTreeOption>());
  for (const group of groups) previousGroups.current.set(group.value, group);
  const value = props.value ?? props.defaultValue;
  const selectedValue = typeof value === "string" ? value : null;
  const unavailable =
    selectedValue && !groups.some((group) => group.value === selectedValue);
  const previous = selectedValue
    ? previousGroups.current.get(selectedValue)
    : undefined;
  const data = buildGroupTreeData(
    unavailable
      ? [
          ...groups,
          {
            value: selectedValue,
            label: `${previous?.label ?? selectedValue} (no longer available)`,
          },
        ]
      : groups,
  );

  return (
    <TreeSelect
      ref={ref}
      {...props}
      placeholder={placeholder}
      data={data}
      error={
        props.error ??
        (unavailable
          ? "The selected group is no longer available. Choose another group or clear the selection."
          : undefined)
      }
      searchable={searchable}
      allowDeselect={allowDeselect}
      comboboxProps={{ withinPortal: true, ...comboboxProps }}
      nothingFoundMessage={nothingFoundMessage}
      filter={(query, node) =>
        getGroupTreeSearchLabel(node)
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      }
      onChange={(value) => {
        if (value === null || groups.some((group) => group.value === value))
          onChange(value);
      }}
    />
  );
});
