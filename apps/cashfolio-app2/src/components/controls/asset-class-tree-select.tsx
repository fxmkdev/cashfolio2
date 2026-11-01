import { TreeSelect, type TreeSelectProps } from "@mantine/core";
import { useUncontrolled } from "@mantine/hooks";
import { forwardRef, useRef } from "react";
import type { ClassificationNode } from "../../shared/asset-class";
import {
  buildAssetClassTreeData,
  filterAssetClassTreeNode,
} from "./asset-class-tree-data";

export type AssetClassTreeSelectProps = Omit<
  TreeSelectProps,
  "data" | "filter" | "mode" | "onChange" | "value" | "defaultValue"
> & {
  nodes: readonly ClassificationNode[];
  unclassifiedValue?: string;
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string | null) => void;
};

export const AssetClassTreeSelect = forwardRef<
  HTMLInputElement,
  AssetClassTreeSelectProps
>(function AssetClassTreeSelect(
  {
    nodes,
    unclassifiedValue,
    value,
    defaultValue,
    onChange,
    comboboxProps,
    clearButtonProps,
    searchable = true,
    allowDeselect = false,
    nothingFoundMessage = "Nothing found",
    ...props
  },
  ref,
) {
  const [selectedValue, setSelectedValue] = useUncontrolled<string | null>({
    value,
    defaultValue,
    finalValue: null,
    onChange,
  });
  const previousNames = useRef(new Map<string, string>());
  for (const node of nodes) previousNames.current.set(node.id, node.name);
  const unavailable =
    selectedValue !== null &&
    selectedValue !== unclassifiedValue &&
    !nodes.some((node) => node.id === selectedValue);
  const data = buildAssetClassTreeData(nodes);
  if (unclassifiedValue !== undefined) {
    data.unshift({ value: unclassifiedValue, label: "Unclassified" });
  }
  if (unavailable) {
    data.push({
      value: selectedValue,
      label: `${previousNames.current.get(selectedValue) ?? selectedValue} (no longer available)`,
      nodeProps: { disabled: true },
    });
  }

  return (
    <TreeSelect
      ref={ref}
      {...props}
      value={selectedValue}
      data={data}
      searchable={searchable}
      allowDeselect={allowDeselect}
      comboboxProps={{ withinPortal: true, ...comboboxProps }}
      clearButtonProps={{
        "aria-hidden": false,
        "aria-label": "Clear Selection",
        tabIndex: 0,
        ...clearButtonProps,
      }}
      nothingFoundMessage={nothingFoundMessage}
      filter={filterAssetClassTreeNode}
      error={
        props.error ??
        (unavailable
          ? `The selected asset class is no longer available. Choose another class${props.clearable ? " or clear the selection" : ""}.`
          : undefined)
      }
      onChange={(next) => {
        if (
          next === null ||
          next === unclassifiedValue ||
          nodes.some((node) => node.id === next)
        ) {
          setSelectedValue(next);
        }
      }}
    />
  );
});
