import { useEffect, useState, type ReactNode } from "react";

type StoryValueProps<T> = {
  value: T;
  children: (value: T, setValue: (value: T) => void) => ReactNode;
};

/** Keep React input state separate from Storybook hooks, including portable tests. */
export function StoryValue<T>({
  value: argsValue,
  children,
}: StoryValueProps<T>) {
  const [value, setValue] = useState(argsValue);
  useEffect(() => setValue(argsValue), [argsValue]);
  return children(value, setValue);
}
