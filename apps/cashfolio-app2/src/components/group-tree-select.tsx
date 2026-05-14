import {
  TreeSelect,
  type TreeNodeData,
  type TreeSelectProps,
} from "@mantine/core";
import { forwardRef, useMemo } from "react";

export type GroupTreeOption = {
  value: string;
  label: string;
  parentGroupId?: string | null;
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
    nothingFoundMessage = "Nothing found",
    searchable = true,
    allowDeselect = false,
    onChange,
    ...props
  },
  ref,
) {
  const data = useMemo(() => buildGroupTreeData(groups), [groups]);

  return (
    <TreeSelect
      ref={ref}
      {...props}
      data={data}
      searchable={searchable}
      allowDeselect={allowDeselect}
      comboboxProps={{ withinPortal: true, ...comboboxProps }}
      nothingFoundMessage={nothingFoundMessage}
      filter={(query, node) =>
        getGroupTreeSearchLabel(node)
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      }
      onChange={onChange}
    />
  );
});
